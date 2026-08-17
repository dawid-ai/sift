import type { DownloadOption } from "@sift/ipc-contract";

/** The subset of a yt-dlp `-J` format entry we use to build download options. */
interface RawFormat {
  ext?: string;
  vcodec?: string;
  acodec?: string;
  height?: number | null;
  tbr?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
}

function isVideo(f: RawFormat): boolean {
  return (
    typeof f.vcodec === "string" &&
    f.vcodec !== "none" &&
    typeof f.height === "number" &&
    f.height > 0
  );
}

function isAudioOnly(f: RawFormat): boolean {
  return (
    typeof f.acodec === "string" &&
    f.acodec !== "none" &&
    (f.vcodec === undefined || f.vcodec === "none")
  );
}

function sizeOf(f: RawFormat): number | null {
  if (typeof f.filesize === "number") return f.filesize;
  if (typeof f.filesize_approx === "number") return f.filesize_approx;
  return null;
}

function tbrOf(f: RawFormat): number {
  return typeof f.tbr === "number" ? f.tbr : 0;
}

// MP4 (H.264 + AAC) preferred for maximum device/Plex compatibility; falls back to
// the best available stream and finally to any combined format.
const FALLBACK_VIDEO_SELECTOR = "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b";
const AUDIO_SELECTOR = "ba[ext=m4a]/ba";

/**
 * Derives a curated, per-video list of download options from a yt-dlp `-J` dump's
 * `formats` array: one entry per available resolution (preferring an MP4/H.264 stream
 * for compatibility) plus an audio-only entry. Sizes are the sum of the chosen video
 * stream and the best audio stream. Falls back to a single "Best" option when an
 * extractor doesn't enumerate formats.
 */
export function computeDownloadOptions(raw: unknown): DownloadOption[] {
  const record =
    typeof raw === "object" && raw !== null
      ? (raw as { formats?: unknown })
      : {};
  const formats: RawFormat[] = Array.isArray(record.formats)
    ? (record.formats as RawFormat[])
    : [];

  const videos = formats.filter(isVideo);
  const audios = formats.filter(isAudioOnly);

  // Best audio: prefer m4a (AAC, mp4-friendly), then highest bitrate.
  const bestAudio = audios.slice().sort((a, b) => {
    const am4a = a.ext === "m4a" ? 1 : 0;
    const bm4a = b.ext === "m4a" ? 1 : 0;
    if (am4a !== bm4a) return bm4a - am4a;
    return tbrOf(b) - tbrOf(a);
  })[0];
  const audioBytes = bestAudio ? sizeOf(bestAudio) : null;

  const options: DownloadOption[] = [];
  const heights = Array.from(
    new Set(videos.map((v) => v.height as number)),
  ).sort((a, b) => b - a);

  for (const h of heights) {
    const atHeight = videos.filter((v) => v.height === h);
    const mp4s = atHeight.filter((v) => v.ext === "mp4");
    const chosen = (mp4s.length > 0 ? mp4s : atHeight)
      .slice()
      .sort((a, b) => tbrOf(b) - tbrOf(a))[0]!;
    const isMp4 = chosen.ext === "mp4";
    const videoBytes = sizeOf(chosen);
    const approxBytes =
      videoBytes !== null || audioBytes !== null
        ? (videoBytes ?? 0) + (audioBytes ?? 0)
        : null;

    options.push({
      id: `${h}p`,
      label: `${h}p`,
      detail: (chosen.ext ?? "").toUpperCase(),
      selector: isMp4
        ? `bv*[height<=${h}][ext=mp4]+ba[ext=m4a]/b[height<=${h}][ext=mp4]/bv*[height<=${h}]+ba/b`
        : `bv*[height<=${h}]+ba/b`,
      approxBytes,
      kind: "video",
    });
  }

  if (options.length === 0) {
    options.push({
      id: "best",
      label: "Best",
      detail: "MP4",
      selector: FALLBACK_VIDEO_SELECTOR,
      approxBytes: null,
      kind: "video",
    });
  }

  options.push({
    id: "audio",
    label: "Audio only",
    detail: (bestAudio?.ext ?? "m4a").toUpperCase(),
    selector: AUDIO_SELECTOR,
    approxBytes: audioBytes,
    kind: "audio",
  });

  return options;
}
