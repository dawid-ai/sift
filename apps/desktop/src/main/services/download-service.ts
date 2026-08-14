import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { buildOutputBaseName, sanitizeFilename } from "@sift/core";
import type { DownloadRow, MediaRow, NewMedia, SiftDatabase } from "@sift/db";
import {
  addTag,
  deleteDownload,
  deleteMedia,
  deleteSummary,
  deleteTranscript,
  getAsset,
  getDownloadById,
  getDownloadByMediaAndFormat,
  getMediaById,
  getMediaBySourceUrl,
  getSummariesByMediaId,
  getTranscriptsByMediaId,
  getDocumentsByMediaId,
  insertMedia,
  listAllTags,
  listMediaChannels,
  listDownloadsByMediaId,
  listMedia,
  listMediaIds,
  listMediaPage,
  listMediaPlatforms,
  listPlaylistEntries,
  searchMedia,
  setDownloadStatus,
  tagsForMedia,
  tagsForMediaIds,
  upsertDownload,
} from "@sift/db";
import type { MediaFilter } from "@sift/db";
import type {
  DownloadOption,
  DownloadProgress,
  DownloadRecord,
  LibraryFacets,
  MediaDetail,
  MediaListItem,
  MediaMetadata,
  MediaPage,
  MediaRecord,
  PlaylistExportResult,
  SearchHit,
} from "@sift/ipc-contract";
import { isAuthError } from "../auth/status";
import { buildM3U } from "./m3u";
import type { YtDlpRunner } from "../sidecars/ytdlp";
import { resolveAssetPath } from "../asset-path";
import { LOCAL_FORMAT_ID, localFileMetadata } from "../local-file";

// Note: deliberately does NOT import `../paths` (which imports `electron`) — this
// service must stay loadable under plain Node for its Vitest suite. `mkdirSync` is
// used directly instead of `paths.ts`'s `ensureDir` helper.

/** Maps normalized yt-dlp metadata into a new `media` row (camelCase → snake_case).
 * `media` is identity-only now — real download state lives on `download` rows. */
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

/** Derives a media's overall download status/path from its `download` rows:
 * any "done" row wins (its path is the media's path), else "downloading" if one is
 * in flight, else "error" if the last attempt failed, else "none". */
function deriveStatus(downloads: DownloadRow[]): {
  status: MediaRecord["downloadStatus"];
  path: string | null;
} {
  const done = downloads.find((d) => d.status === "done");
  if (done) return { status: "done", path: done.file_path };
  if (downloads.some((d) => d.status === "downloading")) return { status: "downloading", path: null };
  if (downloads.some((d) => d.status === "error")) return { status: "error", path: null };
  return { status: "none", path: null };
}

/** Maps a `media` row + its `download` rows into the renderer-facing `MediaRecord`. */
function toMediaRecord(row: MediaRow, downloads: DownloadRow[]): MediaRecord {
  const d = deriveStatus(downloads);
  return {
    id: row.id,
    sourceUrl: row.source_url,
    platformId: row.platform_id,
    externalId: row.external_id,
    title: row.title,
    uploader: row.uploader,
    durationSec: row.duration_s,
    thumbnailUrl: row.thumbnail_path,
    downloadPath: d.path,
    downloadStatus: d.status,
    createdAt: row.created_at,
  };
}

/** Human-facing format label. New downloads carry the real DownloadOption label
 * (e.g. "1080p"). Rows migrated from the pre-download-table schema were labeled
 * "Downloaded" (format_id "legacy") with no quality, because the old `media` table
 * never recorded which format was fetched — so recover it from the saved filename
 * (`… [1080p].mp4` → "1080p", `… [audio].m4a` → "Audio"), falling back to the
 * container extension (`.mp4` → "MP4") when the quality isn't encoded. */
export function downloadDisplayLabel(
  d: Pick<DownloadRow, "format_id" | "label" | "file_path">,
): string {
  if (d.format_id !== "legacy") return d.label;
  const path = d.file_path;
  if (path) {
    const token = /\[([^\]]+)\]\.[^.\\/]+$/.exec(path)?.[1];
    if (token && /^\d+p\d*$/i.test(token)) return token.toLowerCase(); // "1080p", "720p60"
    if (token && /audio/i.test(token)) return "Audio";
    const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1];
    if (ext) return ext.toUpperCase(); // "MP4" / "WEBM" / "M4A"
  }
  return d.label; // last resort: "Downloaded"
}

/** Maps a `download` row into the renderer-facing `DownloadRecord`. */
function toDownloadRecord(d: DownloadRow): DownloadRecord {
  return {
    id: d.id,
    mediaId: d.media_id,
    formatId: d.format_id,
    label: downloadDisplayLabel(d),
    ext: d.ext,
    height: d.height,
    filePath: d.file_path,
    fileSize: d.file_size,
    status: d.status as DownloadRecord["status"],
    error: d.error,
    createdAt: d.created_at,
  };
}

export interface DownloadServiceOpts {
  db: SiftDatabase;
  runner: YtDlpRunner;
  downloadsDir: () => string; // resolves the current downloads dir (live config)
  /** Base dir for managed binaries; used to resolve the stored (relative) ffmpeg path. */
  binariesDir: string;
  /** Injectable for tests; defaults to `node:fs` `existsSync`. Used to verify the download landed. */
  fileExists?: (path: string) => boolean;
  /** Injectable for tests; defaults to `node:fs` `rmSync` (force, ignores missing files). */
  unlinkFile?: (path: string) => void;
  getCookiesFile?: (url: string) => Promise<string | null>;
  reportAuthFailure?: (url: string) => void;
}

export class DownloadService {
  constructor(private readonly opts: DownloadServiceOpts) {}

  /**
   * Downloads `input.metadata` at `input.format`: finds-or-creates the identity `media`
   * row by source URL, upserts a "downloading" `download` row keyed by (media, format),
   * shells out to yt-dlp (forwarding progress with both ids attached), then marks the
   * download row "done" (with the final file path, unlinking a prior file at a different
   * path for the same format) or "error" (rethrowing) on completion.
   */
  async start(
    input: { metadata: MediaMetadata; option: DownloadOption; tags?: string[] },
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<MediaRecord> {
    const { db, runner } = this.opts;
    const downloadsDir = this.opts.downloadsDir();
    const fileExists = this.opts.fileExists ?? existsSync;
    const unlink = this.opts.unlinkFile ?? ((p: string) => rmSync(p, { force: true }));
    const { metadata, option } = input;

    mkdirSync(downloadsDir, { recursive: true });

    const nm = fromMetadata(metadata);
    const existing = getMediaBySourceUrl(db, nm.source_url);
    const media = existing ?? insertMedia(db, nm);
    for (const name of input.tags ?? []) addTag(db, media.id, name);

    const prior = getDownloadByMediaAndFormat(db, media.id, option.id);
    const dl = upsertDownload(db, {
      media_id: media.id,
      format_id: option.id,
      label: option.label,
      ext: null,
      height: null,
      file_path: null,
      // file_size stays null in Part A — the runner returns no size and
      // stat-ing a fake path would break tests; size derived later (stat on done, or Part B).
      file_size: null,
      status: "downloading",
      error: null,
    });

    // Include the option id in the filename so different qualities of the same video
    // don't collide to one name (which made yt-dlp skip the re-download and hand back
    // the previously-downloaded — wrong-quality — file).
    const base = buildOutputBaseName(metadata.uploader, metadata.title);
    const outputTemplate = join(downloadsDir, `${base} [${option.id}].%(ext)s`);
    // yt-dlp needs the managed ffmpeg to merge separate video+audio streams. Without it,
    // yt-dlp silently skips the merge, exits 0, and prints a merged path that never gets
    // written — hence the existsSync guard below.
    const ffmpegRow = getAsset(db, "ffmpeg");
    const ffmpegLocation = ffmpegRow ? resolveAssetPath(this.opts.binariesDir, ffmpegRow.path) : undefined;
    const cookiesFile =
      (await (this.opts.getCookiesFile ?? (async () => null))(metadata.sourceUrl)) ?? undefined;

    try {
      const { filePath } = await runner.download(
        { url: metadata.sourceUrl, format: option.selector, outputTemplate, ffmpegLocation, cookiesFile },
        (p) => onProgress?.({ mediaId: media.id, downloadId: dl.id, ...p }),
      );
      if (!fileExists(filePath)) {
        throw new Error(
          `Download finished but the output file is missing (${filePath}). ` +
            `Video formats need ffmpeg to merge audio+video — install it in Settings → Binaries, then retry.`,
        );
      }
      // Re-downloading the same format collapses to one row: drop the prior file on disk
      // once the new one has landed at a different path (last download wins).
      // This unlink is deliberately not guarded by LOCAL_FORMAT_ID: it only fires when
      // re-downloading the same format_id, and no DownloadOption is ever constructed with id "local".
      if (prior?.file_path && prior.file_path !== filePath && fileExists(prior.file_path)) {
        unlink(prior.file_path);
      }
      setDownloadStatus(db, dl.id, "done", filePath, null, null);
      return toMediaRecord(media, listDownloadsByMediaId(db, media.id));
    } catch (err) {
      if (cookiesFile && isAuthError(err instanceof Error ? err.message : String(err))) {
        this.opts.reportAuthFailure?.(metadata.sourceUrl);
      }
      if (prior && prior.status === "done" && prior.file_path && fileExists(prior.file_path)) {
        // A failed re-download of an already-downloaded format keeps the working copy.
        setDownloadStatus(db, dl.id, "done", prior.file_path, prior.file_size, null);
      } else {
        setDownloadStatus(db, dl.id, "error", null, null, err instanceof Error ? err.message : String(err));
      }
      throw err;
    }
  }

  /**
   * Registers an existing local media file as library media, skipping the download stage:
   * finds-or-creates the identity `media` row by its `file://` source URL, then upserts a
   * "done" `download` row whose `file_path` is **the user's own path** — imports are
   * referenced in place, never copied (see the guard in `remove`/`removeDownload`).
   *
   * That done download row is the whole trick: `TranscriptService` reads it as `audioPath`,
   * which is exactly what Whisper's `canHandle` requires, and `sift-media://` gates on
   * download-table membership rather than a path prefix, so the file plays in-app from
   * wherever it lives.
   *
   * Re-importing the same path is idempotent — same media row, same download row upserted.
   */
  async importLocal(input: {
    path: string;
    durationSec?: number | null;
    tags?: string[];
  }): Promise<MediaRecord> {
    const { db } = this.opts;
    const fileExists = this.opts.fileExists ?? existsSync;
    if (!fileExists(input.path)) {
      throw new Error(`That file no longer exists (${input.path}).`);
    }

    const metadata = localFileMetadata(input.path, input.durationSec ?? null);
    const existing = getMediaBySourceUrl(db, metadata.sourceUrl);
    const media = existing ?? insertMedia(db, fromMetadata(metadata));
    for (const name of input.tags ?? []) addTag(db, media.id, name);

    upsertDownload(db, {
      media_id: media.id,
      format_id: LOCAL_FORMAT_ID,
      label: "Local file",
      ext: extname(input.path).replace(/^\./, "").toLowerCase() || null,
      height: null,
      file_path: input.path,
      file_size: statSync(input.path).size,
      status: "done",
      error: null,
    });

    return toMediaRecord(media, listDownloadsByMediaId(db, media.id));
  }

  /** Lists persisted media, newest first, each with a per-video capture summary
   * (transcript count/newest language, per-format status chips, summary count). No network. */
  async list(): Promise<MediaListItem[]> {
    return this.toListItems(listMedia(this.opts.db));
  }

  /** One page of the library matching `filter`, newest first, with the total match count
   * for the pager. Filtering (tag/channel/platform/date/id-set) happens in SQL, so only the
   * page's rows are enriched — the library no longer loads every row to render one screen. */
  async listPage(filter: MediaFilter, page: number, pageSize: number): Promise<MediaPage> {
    const { rows, total } = listMediaPage(this.opts.db, filter, pageSize, page * pageSize);
    return { items: this.toListItems(rows), total };
  }

  /** Distinct filter values across the WHOLE library (not just the current page) so the
   * channel/platform/tag dropdowns stay complete under pagination. */
  async facets(): Promise<LibraryFacets> {
    const { db } = this.opts;
    return { channels: listMediaChannels(db), platforms: listMediaPlatforms(db), tags: listAllTags(db) };
  }

  /** All media ids matching `filter` (newest first) — used to export the whole filtered set. */
  async listIds(filter: MediaFilter): Promise<number[]> {
    return listMediaIds(this.opts.db, filter);
  }

  /** Enriches media rows into list items (tags + per-video capture summary). Shared by
   * `list()` and `listPage()`. */
  private toListItems(rows: MediaRow[]): MediaListItem[] {
    const { db } = this.opts;
    const tagMap = tagsForMediaIds(db, rows.map((m) => m.id));
    return rows.map((m) => {
      const downloads = listDownloadsByMediaId(db, m.id);
      const transcripts = getTranscriptsByMediaId(db, m.id);
      const summaries = getSummariesByMediaId(db, m.id);
      return {
        media: toMediaRecord(m, downloads),
        transcriptCount: transcripts.length,
        transcriptLanguage: transcripts[0]?.language ?? null,
        formats: downloads.map((d) => ({
          id: d.format_id,
          label: downloadDisplayLabel(d),
          status: d.status as MediaListItem["formats"][number]["status"],
        })),
        summaryCount: summaries.length,
        tags: tagMap.get(m.id) ?? [],
      };
    });
  }

  /** Deletes a media row: unlinks every download's file, then deletes the row (FK
   * cascade also removes its download/transcript/summary rows). */
  async remove(id: number): Promise<void> {
    const { db } = this.opts;
    const fileExists = this.opts.fileExists ?? existsSync;
    const unlink = this.opts.unlinkFile ?? ((p: string) => rmSync(p, { force: true }));

    for (const d of listDownloadsByMediaId(db, id)) {
      // Imported local files are referenced where the user keeps them, never copied —
      // so removing the library row must never delete their file. The row still goes.
      if (d.format_id === LOCAL_FORMAT_ID) continue;
      if (d.file_path && fileExists(d.file_path)) unlink(d.file_path);
    }
    deleteMedia(db, id);
  }

  /** Returns a media row plus its downloads, transcripts, and summaries, newest first. */
  async detail(id: number): Promise<MediaDetail> {
    const { db } = this.opts;
    const media = getMediaById(db, id);
    if (!media) throw new Error(`No media with id ${id}`);
    const dlRows = listDownloadsByMediaId(db, id);
    const downloads = dlRows.map(toDownloadRecord);
    const transcripts = getTranscriptsByMediaId(db, id).map((t) => ({
      id: t.id,
      mediaId: t.media_id,
      providerId: t.provider_id,
      language: t.language,
      text: t.text,
      segments: t.segments_json ? JSON.parse(t.segments_json) : [],
      model: t.model,
      filePath: t.file_path,
      createdAt: t.created_at,
    }));
    const summaries = getSummariesByMediaId(db, id).map((s) => ({
      id: s.id,
      mediaId: s.media_id,
      promptId: s.prompt_id,
      providerId: s.provider_id,
      model: s.model,
      text: s.text,
      filePath: s.file_path,
      createdAt: s.created_at,
    }));
    const documents = getDocumentsByMediaId(db, id).map((d) => ({
      id: d.id,
      mediaId: d.media_id,
      format: d.format,
      path: d.path,
      providerId: d.provider_id,
      model: d.model,
      createdAt: d.created_at,
    }));
    return { media: toMediaRecord(media, dlRows), downloads, transcripts, summaries, documents, tags: tagsForMedia(db, id) };
  }

  /** Deletes a single download row and unlinks its file, if any. */
  async removeDownload(id: number): Promise<void> {
    const { db } = this.opts;
    const fileExists = this.opts.fileExists ?? existsSync;
    const unlink = this.opts.unlinkFile ?? ((p: string) => rmSync(p, { force: true }));

    const row = getDownloadById(db, id);
    // Same guard as remove(): an imported local file is the user's, not ours to delete.
    if (row && row.format_id !== LOCAL_FORMAT_ID && row.file_path && fileExists(row.file_path)) {
      unlink(row.file_path);
    }
    deleteDownload(db, id);
  }

  /** Deletes a transcript row. */
  async removeTranscript(id: number): Promise<void> {
    deleteTranscript(this.opts.db, id);
  }

  /** Deletes a summary row. */
  async removeSummary(id: number): Promise<void> {
    deleteSummary(this.opts.db, id);
  }

  /** Substring search across title/uploader/transcript/summary. No network. */
  async search(query: string): Promise<SearchHit[]> {
    return searchMedia(this.opts.db, query);
  }

  /** Writes an .m3u of the given media that have an on-disk download, to
   * <downloadsDir>/playlists. Media whose file no longer exists are skipped. */
  async exportPlaylist(mediaIds: number[], name: string): Promise<PlaylistExportResult> {
    const { db } = this.opts;
    const downloadsDir = this.opts.downloadsDir();
    const fileExists = this.opts.fileExists ?? existsSync;

    const entries = listPlaylistEntries(db, mediaIds);
    const kept = entries.filter((e) => fileExists(e.filePath));
    const content = buildM3U(kept);

    const dir = join(downloadsDir, "playlists");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${sanitizeFilename(name)}.m3u`);
    writeFileSync(path, content, "utf8");

    return { path, included: kept.length, skipped: entries.length - kept.length };
  }
}
