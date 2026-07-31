import type { SiftDatabase } from "@sift/db";
import {
  addTag,
  deleteQueueItem,
  getQueueItem,
  insertQueueItem,
  listQueueItems,
  maxQueueOrder,
  resetRunningToQueued,
  setQueueOrder,
  updateQueueItem,
  type QueueItemRow,
} from "@sift/db";
import type {
  MediaMetadata,
  QueueItem,
  QueueOpKey,
  QueueOps,
  QueueSpec,
} from "@sift/ipc-contract";
import { computeDownloadOptions } from "./download-options";
import { resolveQueueFormat } from "./queue-format";
import type { DownloadService } from "./download-service";
import type { TranscriptService } from "./transcript-service";
import type { SummarizeService } from "./summarize-service";

// Note: Node-loadable (no electron / ../paths import) so its Vitest suite runs under
// plain Node, mirroring download-service.ts. It orchestrates the other services by
// their public methods only.

export interface QueueWorkerDeps {
  db: SiftDatabase;
  metadata: { fetch(url: string): Promise<MediaMetadata> };
  download: Pick<DownloadService, "start">;
  transcript: Pick<TranscriptService, "get">;
  summarize: Pick<SummarizeService, "start">;
  emit: (items: QueueItem[]) => void;
}

const OP_KEYS: QueueOpKey[] = ["download", "transcript", "summarize"];

function initialOps(spec: QueueSpec): QueueOps {
  return {
    download: spec.download ? "pending" : "skipped",
    transcript: spec.transcript ? "pending" : "skipped",
    summarize: spec.summarize ? "pending" : "skipped",
    messages: {},
  };
}

function msgOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** JSON.parse that returns `fallback` instead of throwing on a corrupt row. Keeps
 * list()/emit() from throwing on a poison item (which would halt the whole drain
 * surface, not just process()); the poison item is still surfaced, just with a
 * fallback value rather than crashing the listing. */
function safeParse<T>(json: string | null, fallback: T): T {
  if (json === null) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function toItem(row: QueueItemRow, progress: number | null): QueueItem {
  const spec = safeParse<QueueSpec>(row.spec_json, null as unknown as QueueSpec);
  // Guarantee `tags` exists on rows persisted before the field was added.
  if (spec && !Array.isArray(spec.tags)) spec.tags = [];
  return {
    id: row.id,
    sourceUrl: row.source_url,
    spec,
    status: row.status as QueueItem["status"],
    ops: row.ops_json === null ? null : safeParse<QueueOps | null>(row.ops_json, null),
    mediaId: row.media_id,
    queueOrder: row.queue_order,
    error: row.error,
    progress: row.status === "running" ? progress : null,
    createdAt: row.created_at,
  };
}

export class QueueWorker {
  private processing = false;
  private paused = false;
  // cancel is cooperative — a running item is flagged here and stops at the
  // next op boundary; yt-dlp is not hard-killed mid-download.
  private readonly canceled = new Set<number>();
  private runningId: number | null = null;
  private runningProgress: number | null = null;

  constructor(private readonly deps: QueueWorkerDeps) {}

  /** Startup: re-queue any item left 'running' by a crash, then drain. */
  recover(): void {
    // resetRunningToQueued only flips the item's status; the interrupted op is still
    // "running" in ops_json. Normalize it back to "pending" (mirroring how retry() resets
    // "error" ops) so process()'s `=== "pending"` guard actually re-runs it — otherwise the
    // op is skipped and the item finishes "done" with the work never done.
    for (const row of listQueueItems(this.deps.db).filter((r) => r.status === "running")) {
      const ops: QueueOps = row.ops_json ? JSON.parse(row.ops_json) : initialOps(JSON.parse(row.spec_json));
      for (const k of OP_KEYS) if (ops[k] === "running") ops[k] = "pending";
      updateQueueItem(this.deps.db, row.id, { ops_json: JSON.stringify(ops) });
    }
    resetRunningToQueued(this.deps.db);
    this.emit();
    void this.tick();
  }

  add(urls: string[], spec: QueueSpec): void {
    let order = maxQueueOrder(this.deps.db);
    for (const url of urls) {
      order += 1;
      insertQueueItem(this.deps.db, {
        source_url: url,
        spec_json: JSON.stringify(spec),
        status: "queued",
        ops_json: JSON.stringify(initialOps(spec)),
        media_id: null,
        queue_order: order,
        error: null,
      });
    }
    this.emit();
    void this.tick();
  }

  list(): QueueItem[] {
    return listQueueItems(this.deps.db).map((r) =>
      toItem(r, r.id === this.runningId ? this.runningProgress : null),
    );
  }

  remove(id: number): void {
    // Removing the running row is allowed; its in-flight op still resolves but
    // finalization no-ops (the row is gone). Rare; acceptable.
    deleteQueueItem(this.deps.db, id);
    this.emit();
  }

  cancel(id: number): void {
    const row = getQueueItem(this.deps.db, id);
    if (!row) return;
    if (row.status === "running") {
      this.canceled.add(id);
    } else if (row.status === "queued") {
      updateQueueItem(this.deps.db, id, { status: "canceled" });
      this.emit();
    }
  }

  retry(id: number): void {
    const row = getQueueItem(this.deps.db, id);
    if (!row) return;
    const ops: QueueOps = row.ops_json ? JSON.parse(row.ops_json) : initialOps(JSON.parse(row.spec_json));
    for (const k of OP_KEYS) if (ops[k] === "error") ops[k] = "pending";
    updateQueueItem(this.deps.db, id, { status: "queued", ops_json: JSON.stringify(ops), error: null });
    this.emit();
    void this.tick();
  }

  reorder(id: number, dir: "up" | "down"): void {
    const items = listQueueItems(this.deps.db);
    const i = items.findIndex((r) => r.id === id);
    if (i < 0) return;
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= items.length) return;
    const a = items[i]!;
    const b = items[j]!;
    setQueueOrder(this.deps.db, a.id, b.queue_order);
    setQueueOrder(this.deps.db, b.id, a.queue_order);
    this.emit();
  }

  pause(): void {
    this.paused = true;
    this.emit();
  }

  resume(): void {
    this.paused = false;
    this.emit();
    void this.tick();
  }

  isPaused(): boolean {
    return this.paused;
  }

  private emit(): void {
    this.deps.emit(this.list());
  }

  private async tick(): Promise<void> {
    if (this.processing || this.paused) return;
    const next = listQueueItems(this.deps.db).find((r) => r.status === "queued");
    if (!next) return;
    this.processing = true;
    this.runningId = next.id;
    try {
      await this.process(next.id);
    } catch (err) {
      // Unattended-drain resilience: every op (and metadata.fetch) is individually
      // guarded inside process(), but an UNEXPECTED throw outside those guards
      // (e.g. JSON.parse on a corrupt spec_json row, or a service throwing
      // synchronously before its await) would otherwise reject here, skip the
      // recursive tick() below, and wedge the whole queue with this item stuck
      // "running". Finalize the poison item as done+error and let the drain continue.
      this.finalizePoisonItem(next.id, err);
    } finally {
      this.processing = false;
      this.runningId = null;
      this.runningProgress = null;
    }
    void this.tick();
  }

  /** Best-effort finalize of an item whose process() threw unexpectedly: mark any
   * non-terminal op `error`, record the error, and set status `done` so the drain
   * moves on. Wrapped in its own try/catch so even a totally corrupt row (e.g.
   * unparseable ops_json) can't re-throw and re-halt the queue. */
  private finalizePoisonItem(id: number, err: unknown): void {
    try {
      const row = getQueueItem(this.deps.db, id);
      if (!row) return;
      let ops: QueueOps;
      try {
        ops = row.ops_json ? JSON.parse(row.ops_json) : initialOps(JSON.parse(row.spec_json));
      } catch {
        ops = { download: "error", transcript: "error", summarize: "error", messages: {} };
      }
      for (const k of OP_KEYS) if (ops[k] === "pending" || ops[k] === "running") ops[k] = "error";
      updateQueueItem(this.deps.db, id, {
        status: "done",
        ops_json: JSON.stringify(ops),
        error: msgOf(err),
      });
      this.emit();
    } catch {
      // Nothing more we can safely do; the drain still continues via tick().
    }
  }

  private async process(id: number): Promise<void> {
    const { db, metadata, download, transcript, summarize } = this.deps;
    const row = getQueueItem(db, id);
    if (!row) return;
    const spec: QueueSpec = JSON.parse(row.spec_json);
    const ops: QueueOps = row.ops_json ? JSON.parse(row.ops_json) : initialOps(spec);
    ops.messages ??= {};
    updateQueueItem(db, id, { status: "running" });
    this.emit();

    let meta: MediaMetadata;
    try {
      meta = await metadata.fetch(row.source_url);
    } catch (err) {
      for (const k of OP_KEYS) if (ops[k] === "pending" || ops[k] === "running") ops[k] = "error";
      updateQueueItem(db, id, { status: "done", ops_json: JSON.stringify(ops), error: msgOf(err) });
      this.emit();
      return;
    }

    let mediaId: number | null = row.media_id;

    // 1) download
    if (ops.download === "pending" && !this.canceled.has(id)) {
      ops.download = "running";
      updateQueueItem(db, id, { ops_json: JSON.stringify(ops) });
      this.emit();
      try {
        const option = resolveQueueFormat(computeDownloadOptions(meta.raw), spec.format);
        const rec = await download.start({ metadata: meta, option }, (p) => {
          this.runningProgress = p.total ? Math.round((p.received / p.total) * 100) : 0;
          this.emit();
        });
        this.runningProgress = null;
        mediaId = rec.id;
        ops.download = "done";
      } catch (err) {
        this.runningProgress = null;
        ops.download = "error";
        ops.messages.download = msgOf(err);
      }
      updateQueueItem(db, id, { ops_json: JSON.stringify(ops), media_id: mediaId });
      this.emit();
    }

    // 2) transcript
    if (ops.transcript === "pending" && !this.canceled.has(id)) {
      ops.transcript = "running";
      updateQueueItem(db, id, { ops_json: JSON.stringify(ops) });
      this.emit();
      try {
        const t = await transcript.get({ metadata: meta });
        mediaId = t.mediaId;
        ops.transcript = "done";
      } catch (err) {
        ops.transcript = "error";
        ops.messages.transcript = msgOf(err);
      }
      updateQueueItem(db, id, { ops_json: JSON.stringify(ops), media_id: mediaId });
      this.emit();
    }

    // 3) summarize — only if a transcript succeeded this run.
    if (ops.summarize === "pending" && !this.canceled.has(id)) {
      if (!spec.summarize || ops.transcript !== "done") {
        // Reachable only when spec.summarize is truthy (else ops.summarize started "skipped"),
        // so the cause is always a missing transcript.
        ops.summarize = "skipped";
        ops.messages.summarize = "needs a transcript";
      } else {
        ops.summarize = "running";
        updateQueueItem(db, id, { ops_json: JSON.stringify(ops) });
        this.emit();
        try {
          const s = await summarize.start({ metadata: meta, ...spec.summarize });
          mediaId = s.mediaId;
          ops.summarize = "done";
        } catch (err) {
          ops.summarize = "error";
          ops.messages.summarize = msgOf(err);
        }
      }
    }

    // Apply spec tags once a media row exists (download happened this run or a prior run).
    // A never-downloaded item (mediaId null, e.g. metadata fetch failed or download errored)
    // is a correct no-op here.
    if (mediaId != null && spec.tags?.length) {
      for (const name of spec.tags) addTag(db, mediaId, name);
    }

    const canceled = this.canceled.has(id);
    this.canceled.delete(id);
    // Auto-clear a fully-successful item: nothing errored, so it's captured in the Library
    // and needn't linger. Failed/partial/canceled items stay (visible + retryable).
    if (!canceled && OP_KEYS.every((k) => ops[k] !== "error")) {
      deleteQueueItem(db, id);
    } else {
      updateQueueItem(db, id, { status: canceled ? "canceled" : "done", ops_json: JSON.stringify(ops), media_id: mediaId });
    }
    this.emit();
  }
}
