import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** yt-dlp returns thumbnail URLs protocol-relative ("//host/..."), which fail to load
 * under the app's file:// scheme + CSP (img-src https:). Coerce them to https. */
export function httpsUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith("//") ? `https:${url}` : url;
}

/** Routes a remote thumbnail through the sift-thumb:// cache protocol (downloaded once, then
 * served from disk — no re-fetch on tab changes; only a changed URL re-downloads). Use for
 * channel/subscription avatars + banners instead of hitting the CDN directly. */
export function thumbUrl(url: string | null | undefined): string | undefined {
  const https = httpsUrl(url);
  return https ? `sift-thumb://img/${encodeURIComponent(https)}` : undefined;
}

// Hosts the sift-thumb cache handler (thumbnail-cache.ts) is allowed to fetch. Kept in sync
// with ALLOWED_HOST there — the renderer must not route a non-cacheable host through the
// protocol (it would 404), so those fall back to loading the raw URL directly.
const CACHEABLE_THUMB_HOST = /(^|\.)(googleusercontent\.com|ggpht\.com|ytimg\.com)$/;

/** Thumbnail src for a VIDEO: YouTube-CDN thumbnails go through the sift-thumb:// disk cache
 * (fetched once by the main process, not the renderer — avoids bursts of remote HTTP/2 requests
 * that the CDN refuses when a whole page of thumbnails loads at once). Non-cacheable hosts fall
 * back to the raw https URL so other platforms' thumbnails still load. */
export function videoThumbUrl(url: string | null | undefined): string | undefined {
  const https = httpsUrl(url);
  if (!https) return undefined;
  // `media.thumbnail_path` holds a remote URL for downloaded videos but an absolute local
  // path for imported files (see the poster grab in main/ipc/import.ts) — route those
  // through sift-poster://, which gates on that column before touching disk.
  if (!/^https?:/i.test(https)) return `sift-poster://file/${encodeURIComponent(https)}`;
  try {
    return CACHEABLE_THUMB_HOST.test(new URL(https).hostname)
      ? `sift-thumb://img/${encodeURIComponent(https)}`
      : https;
  } catch {
    return undefined;
  }
}

/**
 * A URL that's safe to hand to `library.openExternal` (→ `shell.openExternal`), else null.
 *
 * The scheme check is the point, not tidiness: URLs like `media.uploaderUrl` come out of a
 * scraped page via yt-dlp, so they are untrusted input, and `openExternal` will happily
 * launch a `file:` path or whatever a registered custom-protocol handler does with it.
 * Callers render anything that isn't http(s) as plain text instead of a link.
 */
export function externalLinkUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

/** Builds a sift-media:// URL for a downloaded file, served by the main-process protocol
 * handler (which validates the path against the download table before reading disk). */
export function mediaFileUrl(filePath: string): string {
  return `sift-media://file/${encodeURIComponent(filePath)}`;
}
