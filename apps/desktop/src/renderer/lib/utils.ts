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

/** Builds a sift-media:// URL for a downloaded file, served by the main-process protocol
 * handler (which validates the path against the download table before reading disk). */
export function mediaFileUrl(filePath: string): string {
  return `sift-media://file/${encodeURIComponent(filePath)}`;
}
