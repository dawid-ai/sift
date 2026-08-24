import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  TranscriptContext,
  TranscriptMethod,
  TranscriptProgressFn,
  TranscriptRegistry,
  TranscriptSegment,
} from "@sift/core";
import {
  buildOutputBaseName,
  pickTranscriptLanguage,
  resolveTranscriptProvider,
  sanitizeFilename,
  segmentsToSrt,
} from "@sift/core";
import type { NewMedia, SiftDatabase, TranscriptRow } from "@sift/db";
import {
  deleteTranscript,
  getMediaById,
  getMediaBySourceUrl,
  getTranscriptById,
  getTranscriptsByMediaId,
  insertMedia,
  insertTranscript,
  listDownloadsByMediaId,
  setTranscriptFilePath,
} from "@sift/db";
import type { MediaMetadata, TranscriptRecord } from "@sift/ipc-contract";
import { isAuthError } from "../auth/status";
import { resolveOutputPath } from "./output-path";

// Note: deliberately does NOT import `../paths` (which imports `electron`) — this
// service must stay loadable under plain Node for its Vitest suite, mirroring
// `download-service.ts`.

// duplicated (not shared with DownloadService's private mapper) — same
// ~12-line camel→snake literal, only `download_status` differs ("none" here since
// a transcript-only job never downloads the media). Unify only if a third caller appears.
function fromMetadata(m: MediaMetadata): NewMedia {
  return {
    source_url: m.sourceUrl,
    platform_id: m.platform.id,
    external_id: m.externalId,
    title: m.title,
    uploader: m.uploader,
    uploader_url: m.uploaderUrl,
    duration_s: m.durationSec,
    thumbnail_path: m.thumbnailUrl,
    view_count: m.viewCount,
    like_count: m.likeCount,
    published_at: null,
    metadata_json: JSON.stringify(m.raw),
    channel_id: m.channelId,
    download_status: "none",
  };
}

/** Maps a `transcript` row into the renderer-facing `TranscriptRecord` (snake_case → camelCase). */
function toRecord(row: TranscriptRow, mediaId: number): TranscriptRecord {
  return {
    id: row.id,
    mediaId,
    providerId: row.provider_id,
    language: row.language,
    text: row.text,
    segments: JSON.parse(row.segments_json ?? "[]"),
    model: row.model,
    filePath: row.file_path,
    createdAt: row.created_at,
  };
}

export interface TranscriptServiceOpts {
  db: SiftDatabase;
  registry: TranscriptRegistry;
  downloadsDir: () => string; // resolves the current downloads dir (live config)
  getPreferredLanguages: () => string[];
  /** Explicit transcription language, or "auto" to keep the caption-driven pick. */
  getForcedLanguage?: () => string;
  getMethod: () => TranscriptMethod;
  getCookiesFile?: (url: string) => Promise<string | null>;
  reportAuthFailure?: (url: string) => void;
}

export class TranscriptService {
  constructor(private readonly opts: TranscriptServiceOpts) {}

  // In-flight non-force jobs keyed by sourceUrl. The idempotency check inside runGet
  // (return the existing transcript) is a check-then-act: two overlapping get() calls
  // for the same video — e.g. the queue worker transcribing while the user clicks
  // "Get transcript" — would both see zero existing rows and both insert, producing a
  // duplicate. Sharing one promise per sourceUrl collapses them into a single job.
  private readonly inflight = new Map<string, Promise<TranscriptRecord>>();

  async get(
    input: { metadata: MediaMetadata; force?: "whisper" },
    onProgress?: TranscriptProgressFn,
  ): Promise<TranscriptRecord> {
    // Force re-transcribes are explicit, single-shot user actions — don't dedupe them.
    if (input.force === "whisper") return this.runGet(input, onProgress);
    const key = input.metadata.sourceUrl;
    const pending = this.inflight.get(key);
    // A second concurrent caller shares the first job's promise — its own onProgress is
    // intentionally not wired (the first caller / the transcript:progress broadcast drive UI).
    if (pending) return pending;
    const p = this.runGet(input, onProgress).finally(() =>
      this.inflight.delete(key),
    );
    this.inflight.set(key, p);
    return p;
  }

  /**
   * Finds-or-creates the media row for `input.metadata.sourceUrl` (creating it with
   * `download_status: "none"` when it doesn't exist — a transcript-only job never
   * downloads the video). Idempotent: if a transcript already exists for that media
   * row, returns the newest one without re-invoking any provider — unless
   * `input.force === "whisper"`, which bypasses the cache and always re-transcribes
   * locally. The provider is resolved via `resolveTranscriptProvider` using the
   * configured default method (`getMethod()`), or "prefer_whisper" when forced.
   * Throws a clear "no captions" error if no provider can handle it — the media row
   * is left in place so a later (e.g. Whisper) run can attach a transcript to it.
   *
   * Data safety: on the force path, the previous transcript row(s) are only deleted
   * AFTER a successful transcribe + insert of the new row, so a failed forced
   * re-transcribe never destroys the existing transcript.
   */
  private async runGet(
    input: { metadata: MediaMetadata; force?: "whisper" },
    onProgress?: TranscriptProgressFn,
  ): Promise<TranscriptRecord> {
    const { db, registry } = this.opts;
    const { metadata } = input;

    let media = getMediaBySourceUrl(db, metadata.sourceUrl);
    if (!media) media = insertMedia(db, fromMetadata(metadata));

    const existing = getTranscriptsByMediaId(db, media.id);
    if (input.force !== "whisper" && existing.length > 0)
      return toRecord(existing[0]!, media.id);

    // An explicit Whisper language wins over the caption-driven pick: the user set it to
    // transcribe content the metadata mislabels, which is exactly the case the automatic
    // choice gets wrong. "auto" (the default) leaves the existing behaviour alone.
    const forcedLanguage = this.opts.getForcedLanguage?.() ?? "auto";
    const language =
      forcedLanguage !== "auto"
        ? forcedLanguage
        : pickTranscriptLanguage({
            videoLanguage: metadata.language,
            available: metadata.captionLanguages,
            preferred: this.opts.getPreferredLanguages(),
          });
    // audioPath = the newest COMPLETED download's file on disk (media.download_path is
    // vestigial/always-null post redesign Part A). Only Whisper (this) consumes it; the
    // yt-dlp-subs provider ignores it. null when nothing has been downloaded yet.
    const doneDownload = listDownloadsByMediaId(db, media.id).find(
      (d) => d.status === "done" && d.file_path,
    );
    const cookiesFile =
      (await (this.opts.getCookiesFile ?? (async () => null))(
        metadata.sourceUrl,
      )) ?? null;
    const ctx: TranscriptContext = {
      sourceUrl: metadata.sourceUrl,
      hasCaptions: metadata.hasCaptions,
      language,
      captionLanguages: metadata.captionLanguages,
      audioPath: doneDownload?.file_path ?? null,
      cookiesFile,
    };
    let provider;
    if (input.force === "whisper") {
      // Strict: force:"whisper" must never silently fall back to a caption provider.
      // resolveTranscriptProvider("prefer_whisper") would do exactly that when Whisper
      // can't handle the video, contradicting the "Re-transcribe with Whisper" button
      // and this method's own force-re-transcribes-locally contract.
      provider =
        registry.list().find((p) => p.local && p.canHandle(ctx)) ?? null;
      if (!provider) {
        throw new Error(
          "Whisper can't transcribe this video. Make sure Whisper is installed (Settings → Transcription → Whisper) and the video has been downloaded.",
        );
      }
    } else {
      provider = resolveTranscriptProvider(
        registry.list(),
        ctx,
        this.opts.getMethod(),
      );
      if (!provider) {
        throw new Error(
          "No captions found. Install Whisper (Settings → Transcription → Whisper) to transcribe downloaded videos locally.",
        );
      }
    }

    let result;
    try {
      result = await provider.transcribe(ctx, onProgress ?? (() => {}));
    } catch (err) {
      if (
        cookiesFile &&
        isAuthError(err instanceof Error ? err.message : String(err))
      ) {
        this.opts.reportAuthFailure?.(metadata.sourceUrl);
      }
      throw err;
    }
    const row = insertTranscript(db, {
      media_id: media.id,
      provider_id: result.providerId,
      language: result.language,
      text: result.text,
      segments_json: JSON.stringify(result.segments),
      model: result.model,
    });
    // Auto-write the .txt so the Files tab can "Open" it. Best-effort: a write failure
    // must not lose the transcript (the DB row is the source of truth) — file_path stays null.
    try {
      const downloadsDir = this.opts.downloadsDir();
      const base = buildOutputBaseName(media.uploader, media.title);
      // provider in the name keeps captions vs whisper distinct for the same video.
      const path = join(
        downloadsDir,
        `${sanitizeFilename(`${base}__transcript-${result.providerId}`)}.txt`,
      );
      mkdirSync(downloadsDir, { recursive: true });
      writeFileSync(path, result.text, "utf8");
      setTranscriptFilePath(db, row.id, path);
      row.file_path = path;
    } catch {
      /* leave file_path null */
    }
    // Only delete the previous transcript(s) after the new one is safely persisted —
    // a failed transcribe (thrown above) never reaches here, so the old row survives.
    if (input.force === "whisper") {
      for (const t of existing) deleteTranscript(db, t.id);
    }
    return toRecord(row, media.id);
  }

  /**
   * Writes a transcript's segments to `<base>__transcript-<provider>.srt` under the downloads
   * dir and returns the absolute path. Throws when the transcript has no timestamps — a
   * caption source can produce text with no segments, and an empty .srt is worse than an error.
   */
  async exportSrt(transcriptId: number): Promise<string> {
    const { db } = this.opts;
    const row = getTranscriptById(db, transcriptId);
    if (!row) throw new Error("Transcript not found.");
    const segments = row.segments_json
      ? (JSON.parse(row.segments_json) as TranscriptSegment[])
      : [];
    const srt = segmentsToSrt(segments);
    if (!srt)
      throw new Error(
        "This transcript has no timestamps, so it can't be exported as subtitles.",
      );
    const media = getMediaById(db, row.media_id);
    if (!media) throw new Error("Media not found.");
    const dir = this.opts.downloadsDir();
    const base = buildOutputBaseName(media.uploader, media.title);
    mkdirSync(dir, { recursive: true });
    // Re-exporting the same transcript reuses the file (identical bytes); a different
    // transcript for the same video gets its own, instead of overwriting the earlier one.
    const path = resolveOutputPath(
      dir,
      sanitizeFilename(`${base}__transcript-${row.provider_id}`),
      "srt",
      srt,
    );
    writeFileSync(path, srt, "utf8");
    return path;
  }
}
