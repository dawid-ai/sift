import { basename, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { MediaMetadata } from "@sift/ipc-contract";

// Note: deliberately NOT in `@sift/core` — this needs `node:url` for correct Windows
// path→URL encoding (drive letters, backslashes, spaces, non-ASCII), and core has zero
// `node:` imports because the renderer imports it directly. Both consumers of this file
// (DownloadService, MetadataService) are main-process services.
//
// Also deliberately does NOT import `../paths` (which imports `electron`), matching
// `download-service.ts` and `metadata-service.ts` — this must stay loadable under plain
// Node for its Vitest suite.

/** `download.format_id` for an imported local file. A value, not a schema column: no
 * migration needed, and `downloadDisplayLabel` already returns `label` verbatim for any
 * format_id other than "legacy". Also the discriminator for the delete guard. */
export const LOCAL_FORMAT_ID = "local";

/** True when `url` is a local-file source URL — the identity key for imported media. */
export function isLocalFileUrl(url: string): boolean {
  return url.startsWith("file:");
}

/** The absolute path back out of a local-file source URL. */
export function filePathFromUrl(url: string): string {
  return fileURLToPath(url);
}

/**
 * Synthesizes the `MediaMetadata` for a local media file, with no yt-dlp involved.
 *
 * `hasCaptions: false` is load-bearing: it makes `ytdlp-subs`'s `canHandle` false, so
 * provider resolution falls through to Whisper with no change to any provider or to
 * `resolveTranscriptProvider`.
 *
 * `platform.tier: "tested"` is not a claim about yt-dlp coverage — the tier drives a
 * "this platform is untested" caution in the UI that would be nonsense for a local file.
 * The pseudo-platform is built here rather than added to `TESTED_PLATFORMS`, which is a
 * curated list of real yt-dlp extractor keys.
 */
export function localFileMetadata(
  absPath: string,
  durationSec: number | null = null,
): MediaMetadata {
  return {
    sourceUrl: pathToFileURL(absPath).href,
    platform: { id: "local", label: "Local file", tier: "tested" },
    externalId: null,
    title: basename(absPath, extname(absPath)),
    uploader: null,
    uploaderUrl: null,
    channelId: null,
    durationSec,
    thumbnailUrl: null,
    viewCount: null,
    likeCount: null,
    uploadDate: null,
    hasCaptions: false,
    language: null,
    captionLanguages: [],
    formats: [],
    raw: {},
  };
}
