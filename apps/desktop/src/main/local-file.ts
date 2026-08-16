import { basename, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LOCAL_PLATFORM_ID } from "@sift/core";
import type { MediaMetadata } from "@sift/ipc-contract";

// Note: deliberately NOT in `@sift/core` — this needs `node:url` for correct Windows
// path→URL encoding (drive letters, backslashes, spaces, non-ASCII), and core has zero
// `node:` imports because the renderer imports it directly. Both consumers of this file
// (DownloadService, MetadataService) are main-process services.
//
// Also deliberately does NOT import `../paths` (which imports `electron`), matching
// `download-service.ts` and `metadata-service.ts` — this must stay loadable under plain
// Node for its Vitest suite.

// Re-exported so main-process code keeps reading it from here; it lives in `@sift/core`
// because the renderer needs it too (format label + "your file stays put" copy).
export { LOCAL_FORMAT_ID } from "@sift/core";

/** True when `url` is a local-file source URL — the identity key for imported media. */
export function isLocalFileUrl(url: string): boolean {
  return url.startsWith("file:");
}

/** The absolute path back out of a local-file source URL. */
export function filePathFromUrl(url: string): string {
  return fileURLToPath(url);
}

/**
 * Where to grab an imported file's poster frame: 10% in, clamped to [5s, 120s].
 *
 * Proportional covers a 90-second clip and a 3-hour lecture with one rule; the 5s floor
 * skips black frames and fade-ins; the 120s ceiling stops a long video's poster being
 * buried in the middle. Deterministic on purpose — a random point would silently change
 * the thumbnail on re-import, which hurts recognition. Unknown duration falls back to
 * the floor.
 */
export function posterSeekSeconds(durationSec: number | null | undefined): number {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return 5;
  return Math.min(120, Math.max(5, durationSec * 0.1));
}

/**
 * Pixel dimensions from a JPEG's SOFn (start-of-frame) marker, or null if `buf` isn't a
 * JPEG we can parse.
 *
 * Used to recover an imported video's resolution from the poster frame ffmpeg just wrote
 * — the poster is encoded at the source frame size, so its height *is* the video's. The
 * renderer's `<video>` probe is the first source of that number, but it comes back empty
 * whenever Chromium can't decode the container (MKV, some HEVC) and always on the picker
 * path, which has no `File` object to probe. Without this fallback the Formats column
 * shows a container ("MP4") next to a downloaded row's resolution ("2160p") — two
 * different kinds of thing in one column.
 *
 * Anamorphic video (SAR ≠ 1) reports coded, not display, height. Accepted: it is a label.
 */
export function jpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1]!;
    // Standalone markers (padding, RSTn, SOI/EOI) carry no length field.
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    // SOF0–SOF15 hold the frame size; DHT/JPGA/DAC share the range but aren't SOFs.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > buf.length) return null;
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    const segment = buf.readUInt16BE(i + 2);
    if (segment < 2) return null; // malformed: would loop forever
    i += 2 + segment;
  }
  return null;
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
    platform: { id: LOCAL_PLATFORM_ID, label: "Local file", tier: "tested" },
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
