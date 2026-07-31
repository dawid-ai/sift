import type { DownloadOption, QueueFormatPref } from "@sift/ipc-contract";

// Note: pure + dependency-free so it runs under plain Node in Vitest. Do not import
// electron or ../paths here.

/** Parses the leading integer of a video option id like "1080p" → 1080; NaN-safe. */
function heightOf(o: DownloadOption): number {
  const n = parseInt(o.id, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Resolves a stored format preference against a video's real download options
 * (from `computeDownloadOptions`). Audio → the audio option. Video → the highest
 * resolution at or below `maxHeight` (or highest overall when uncapped); if the cap
 * excludes everything, the lowest video option; if the extractor enumerated no
 * resolutions, the single fallback option. Always returns some option (never throws).
 */
export function resolveQueueFormat(
  options: DownloadOption[],
  pref: QueueFormatPref,
): DownloadOption {
  if (options.length === 0) throw new Error("No download options to resolve");

  if (pref.kind === "audio") {
    return options.find((o) => o.kind === "audio") ?? options[0]!;
  }

  const videos = options
    .filter((o) => o.kind === "video")
    .slice()
    .sort((a, b) => heightOf(b) - heightOf(a)); // highest first
  if (videos.length === 0) return options[0]!;

  if (pref.maxHeight === null) return videos[0]!;

  const atOrBelow = videos.find((o) => heightOf(o) <= pref.maxHeight!);
  return atOrBelow ?? videos[videos.length - 1]!; // cap below all → lowest video
}
