import { beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDatabase } from "@sift/db/testing";
import { runMigrations, insertQueueItem, insertMedia, tagsForMedia, type SiftDatabase } from "@sift/db";
import type { MediaMetadata, QueueSpec } from "@sift/ipc-contract";
import { QueueWorker, type QueueWorkerDeps } from "./queue-worker";

// `queue_item.media_id` and the real DownloadService/TranscriptService/SummarizeService all
// carry a FK to `media(id)`. The mocked services here don't do real inserts, so any op that
// "returns" a media/transcript/summary id must reference a row we actually seeded, or
// persisting it via updateQueueItem trips the FK constraint (sql.js enforces it just like
// real SQLite). Deviation from the brief's literal `id: 10` placeholders — those don't
// correspond to any row and fail under FK enforcement.
function seedMedia(db: SiftDatabase): number {
  return insertMedia(db, {
    source_url: "https://x/1",
    platform_id: "youtube",
    external_id: null,
    title: "T",
    uploader: null,
    uploader_url: null,
    duration_s: null,
    thumbnail_path: null,
    view_count: null,
    like_count: null,
    published_at: null,
    metadata_json: null,
    download_status: "none",
  }).id;
}

const META = (over: Partial<MediaMetadata> = {}): MediaMetadata =>
  ({
    sourceUrl: "https://x/1",
    platform: { id: "youtube", label: "YouTube", tier: "tested" },
    externalId: "1",
    title: "T",
    uploader: "U",
    uploaderUrl: null,
    durationSec: 1,
    thumbnailUrl: null,
    viewCount: null,
    likeCount: null,
    uploadDate: null,
    hasCaptions: true,
    language: "en",
    captionLanguages: ["en"],
    formats: [],
    raw: { formats: [{ ext: "mp4", vcodec: "avc1", acodec: "none", height: 720, tbr: 1000, filesize: 1 }, { ext: "m4a", vcodec: "none", acodec: "aac", height: null, tbr: 128, filesize: 1 }] },
    ...over,
  }) as MediaMetadata;

const SPEC = (over: Partial<QueueSpec> = {}): QueueSpec => ({
  format: { kind: "video", maxHeight: null, mp4: true },
  download: true,
  transcript: false,
  summarize: null,
  tags: [],
  ...over,
});

// Deferred-promise helper so tests can assert intermediate (running) state.
function makeDeps(db: SiftDatabase, over: Partial<QueueWorkerDeps> = {}): QueueWorkerDeps {
  const mediaId = seedMedia(db);
  return {
    db,
    metadata: { fetch: vi.fn(async () => META()) },
    download: { start: vi.fn(async () => ({ id: mediaId })) as unknown as QueueWorkerDeps["download"]["start"] },
    transcript: { get: vi.fn(async () => ({ mediaId })) as unknown as QueueWorkerDeps["transcript"]["get"] },
    summarize: { start: vi.fn(async () => ({ mediaId })) as unknown as QueueWorkerDeps["summarize"]["start"] },
    emit: vi.fn(),
    ...over,
  };
}

// Waits for the worker's async tick chain to settle.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("QueueWorker", () => {
  let db: SiftDatabase;
  beforeEach(async () => {
    db = await openTestDatabase();
    runMigrations(db);
  });

  it("add → drains and auto-clears the fully-successful item, calling download.start once", async () => {
    const deps = makeDeps(db);
    const w = new QueueWorker(deps);
    w.add(["https://x/1"], SPEC());
    await flush();
    // No errors → the item is removed from the queue (it's in the Library now).
    expect(w.list()).toHaveLength(0);
    expect(deps.download.start).toHaveBeenCalledTimes(1);
  });

  it("applies spec.tags to the produced media after a successful download", async () => {
    const mediaId = seedMedia(db);
    const deps = makeDeps(db, {
      download: {
        start: vi.fn(async () => ({ id: mediaId })) as unknown as QueueWorkerDeps["download"]["start"],
      },
    });
    const w = new QueueWorker(deps);
    w.add(["https://x/1"], SPEC({ tags: ["Music"] }));
    await flush();
    // Fully successful (no errored ops) → auto-cleared from the queue.
    expect(w.list()).toHaveLength(0);
    expect(tagsForMedia(db, mediaId)).toEqual(["Music"]);
  });

  it("processes items sequentially in queue order", async () => {
    const order: string[] = [];
    const mediaId = seedMedia(db);
    const deps = makeDeps(db, {
      download: {
        start: vi.fn(async (input: { metadata: MediaMetadata }) => {
          order.push(input.metadata.sourceUrl);
          return { id: mediaId } as never;
        }) as unknown as QueueWorkerDeps["download"]["start"],
      },
      metadata: { fetch: vi.fn(async (url: string) => META({ sourceUrl: url })) },
    });
    const w = new QueueWorker(deps);
    w.add(["https://x/a", "https://x/b"], SPEC());
    await flush();
    await flush();
    expect(order).toEqual(["https://x/a", "https://x/b"]);
  });

  it("partial-success: download done + transcript error → item done, summarize skipped", async () => {
    const deps = makeDeps(db, {
      transcript: { get: vi.fn(async () => { throw new Error("429 too many"); }) as never },
    });
    const w = new QueueWorker(deps);
    w.add(["https://x/1"], SPEC({ transcript: true, summarize: { providerId: "p", model: "m", promptId: 1 } }));
    await flush();
    const it0 = w.list()[0]!;
    expect(it0.status).toBe("done");
    expect(it0.ops!.download).toBe("done");
    expect(it0.ops!.transcript).toBe("error");
    expect(it0.ops!.summarize).toBe("skipped"); // needs a transcript
    expect(it0.ops!.messages!.transcript).toContain("429");
    expect(deps.summarize.start).not.toHaveBeenCalled();
  });

  it("happy path: transcript done → summarize runs with the spec's provider/model/prompt", async () => {
    const deps = makeDeps(db); // default fakes: transcript.get + summarize.start both resolve
    const w = new QueueWorker(deps);
    w.add(["https://x/1"], SPEC({ transcript: true, summarize: { providerId: "p", model: "m", promptId: 1 } }));
    await flush();
    // All ops succeeded → item auto-cleared.
    expect(w.list()).toHaveLength(0);
    expect(deps.transcript.get).toHaveBeenCalledTimes(1);
    expect(deps.summarize.start).toHaveBeenCalledTimes(1);
    expect(deps.summarize.start).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: "p", model: "m", promptId: 1 }),
    );
  });

  it("a poison item (corrupt spec_json) is finalized done+error and the drain continues", async () => {
    // Seed a corrupt row directly: JSON.parse(spec_json) throws inside process(),
    // OUTSIDE its per-op guards, which would reject tick() and wedge the queue.
    insertQueueItem(db, {
      source_url: "https://x/poison",
      spec_json: "{not json",
      status: "queued",
      ops_json: null,
      media_id: null,
      queue_order: 1,
      error: null,
    });
    const deps = makeDeps(db);
    const w = new QueueWorker(deps);
    // A well-formed item queued behind the poison one; it must still drain.
    w.add(["https://x/ok"], SPEC());
    await flush();
    await flush();
    const items = w.list();
    const poison = items.find((i) => i.sourceUrl === "https://x/poison")!;
    // Poison item didn't hang: finalized done with an error recorded → it stays visible.
    expect(poison.status).toBe("done");
    expect(poison.error).toBeTruthy();
    // Drain continued past the poison item AND the well-formed one succeeded → auto-cleared.
    expect(items.find((i) => i.sourceUrl === "https://x/ok")).toBeUndefined();
    expect(deps.download.start).toHaveBeenCalledTimes(1);
  });

  it("retry re-runs only the errored ops", async () => {
    const mediaId = seedMedia(db);
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ mediaId });
    const start = vi.fn(async () => ({ id: mediaId }));
    const deps = makeDeps(db, {
      transcript: { get: get as never },
      download: { start: start as never },
    });
    const w = new QueueWorker(deps);
    w.add(["https://x/1"], SPEC({ transcript: true }));
    await flush();
    expect(w.list()[0]!.ops!.transcript).toBe("error");
    w.retry(w.list()[0]!.id);
    await flush();
    // retry re-ran only transcript (now succeeds) → item fully clean → auto-cleared.
    expect(w.list()).toHaveLength(0);
    expect(get).toHaveBeenCalledTimes(2); // transcript re-run
    expect(start).toHaveBeenCalledTimes(1); // download NOT re-run
  });

  it("metadata fetch failure marks all requested ops error, item done", async () => {
    const deps = makeDeps(db, { metadata: { fetch: vi.fn(async () => { throw new Error("no such video"); }) } });
    const w = new QueueWorker(deps);
    w.add(["https://x/1"], SPEC({ transcript: true }));
    await flush();
    const it0 = w.list()[0]!;
    expect(it0.status).toBe("done");
    expect(it0.error).toContain("no such video");
    expect(it0.ops!.download).toBe("error");
    expect(it0.ops!.transcript).toBe("error");
  });

  it("recover re-queues rows left running by a crash AND re-runs the interrupted op", async () => {
    insertQueueItem(db, {
      source_url: "https://x/1",
      spec_json: JSON.stringify(SPEC()),
      status: "running",
      ops_json: JSON.stringify({ download: "running", transcript: "skipped", summarize: "skipped" }),
      media_id: null,
      queue_order: 1,
      error: null,
    });
    const deps = makeDeps(db);
    const w = new QueueWorker(deps);
    w.recover();
    await flush();
    // recovered → op normalized "running"→"pending" → re-queued → the interrupted download
    // actually re-runs (not silently skipped) → succeeds → item auto-cleared.
    expect(w.list()).toHaveLength(0);
    expect(deps.download.start).toHaveBeenCalledTimes(1);
  });

  it("cancel while running stops before the next op (transcript/summarize not run)", async () => {
    const mediaId = seedMedia(db);
    // Deferred download so we can cancel mid-flight, between op boundaries.
    let resolveDownload!: (v: { id: number }) => void;
    let downloadStarted!: () => void;
    const started = new Promise<void>((r) => { downloadStarted = r; });
    const deps = makeDeps(db, {
      download: {
        start: vi.fn(() => {
          downloadStarted();
          return new Promise<{ id: number }>((res) => { resolveDownload = res; });
        }) as unknown as QueueWorkerDeps["download"]["start"],
      },
      transcript: { get: vi.fn(async () => ({ mediaId })) as never },
      summarize: { start: vi.fn(async () => ({ mediaId })) as never },
    });
    const w = new QueueWorker(deps);
    w.add(["https://x/1"], SPEC({ transcript: true, summarize: { providerId: "p", model: "m", promptId: 1 } }));

    // Wait until download.start has actually begun (item is running).
    await started;
    const id = w.list()[0]!.id;
    expect(w.list()[0]!.status).toBe("running");

    w.cancel(id); // cooperative: flags the running item
    resolveDownload({ id: mediaId }); // let the in-flight download finish
    await flush();

    const it0 = w.list()[0]!;
    expect(it0.status).toBe("canceled");
    expect(it0.ops!.download).toBe("done"); // the op already in flight completed
    expect(deps.transcript.get).not.toHaveBeenCalled(); // stopped before the next op
    expect(deps.summarize.start).not.toHaveBeenCalled();
  });

  it("reorder swaps adjacent queue order", async () => {
    // Pause so nothing drains while we reorder.
    const deps = makeDeps(db);
    const w = new QueueWorker(deps);
    w.pause();
    w.add(["https://x/a", "https://x/b"], SPEC());
    const [, b] = w.list();
    w.reorder(b!.id, "up");
    expect(w.list().map((i) => i.sourceUrl)).toEqual(["https://x/b", "https://x/a"]);
  });

  it("pause stops picking new items", async () => {
    const deps = makeDeps(db);
    const w = new QueueWorker(deps);
    w.pause();
    w.add(["https://x/1"], SPEC());
    await flush();
    expect(w.list()[0]!.status).toBe("queued");
    expect(deps.download.start).not.toHaveBeenCalled();
  });

  it("isPaused reflects pause()/resume()", () => {
    const deps = makeDeps(db);
    const worker = new QueueWorker(deps);
    expect(worker.isPaused()).toBe(false);
    worker.pause();
    expect(worker.isPaused()).toBe(true);
    worker.resume();
    expect(worker.isPaused()).toBe(false);
  });
});
