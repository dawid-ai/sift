/**
 * Clip helpers: turning a transcript span into a shareable timestamped link, and into the
 * ffmpeg arguments for a media clip. Pure — the desktop app runs ffmpeg.
 */

export type ClipKind = "audio" | "video" | "vertical";

export const CLIP_LABEL: Record<ClipKind, string> = {
  audio: "Audio clip (.m4a)",
  video: "Video clip (.mp4)",
  vertical: "Vertical short (1080×1920)",
};

export const CLIP_EXTENSION: Record<ClipKind, string> = {
  audio: "m4a",
  video: "mp4",
  vertical: "mp4",
};

/** Longest clip a single export will cut, in seconds. */
export const MAX_CLIP_SECONDS = 60 * 20;

/**
 * A link to `seconds` into the source, using each platform's own parameter.
 *
 * Falls back to returning the URL unchanged rather than guessing: an invented parameter on a
 * platform that ignores it produces a link that silently starts from the beginning, which is
 * worse than a link that visibly has no timestamp.
 */
export function timestampedUrl(sourceUrl: string, seconds: number): string {
  const at = Math.max(0, Math.floor(seconds));
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return sourceUrl;
  }
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();

  if (host === "youtube.com" || host === "m.youtube.com") {
    url.searchParams.set("t", `${at}s`);
    return url.toString();
  }
  if (host === "youtu.be") {
    url.searchParams.set("t", String(at));
    return url.toString();
  }
  if (host === "vimeo.com") {
    // Vimeo reads the fragment, not a query parameter.
    url.hash = `t=${at}s`;
    return url.toString();
  }
  if (host === "twitch.tv" || host === "clips.twitch.tv") {
    const h = Math.floor(at / 3600);
    const m = Math.floor((at % 3600) / 60);
    url.searchParams.set("t", `${h}h${m}m${at % 60}s`);
    return url.toString();
  }
  if (host === "soundcloud.com") {
    url.hash = `t=${Math.floor(at / 60)}:${String(at % 60).padStart(2, "0")}`;
    return url.toString();
  }
  return sourceUrl;
}

/** True when the platform supports a start-time link at all. */
export function supportsTimestampLink(sourceUrl: string): boolean {
  return timestampedUrl(sourceUrl, 1) !== sourceUrl;
}

export interface ClipRange {
  startSeconds: number;
  endSeconds: number;
}

/** Clamps a span to non-negative, ordered, and at most `MAX_CLIP_SECONDS` long. */
export function normalizeRange(range: ClipRange): ClipRange {
  const start = Math.max(0, Math.min(range.startSeconds, range.endSeconds));
  const rawEnd = Math.max(
    start,
    Math.max(range.startSeconds, range.endSeconds),
  );
  return {
    startSeconds: start,
    endSeconds: Math.min(rawEnd, start + MAX_CLIP_SECONDS),
  };
}

/**
 * ffmpeg arguments for one clip.
 *
 * `-ss` before `-i` so ffmpeg seeks rather than decoding from zero — the difference on an
 * hour-long file is seconds against minutes. Audio and video clips stream-copy, which is why
 * they are near-instant; the cut lands on the nearest keyframe, which is the accepted trade
 * for not re-encoding. The vertical short must re-encode, because it changes the frame.
 */
export function clipArgs(input: {
  inputPath: string;
  outputPath: string;
  kind: ClipKind;
  range: ClipRange;
}): string[] {
  const { startSeconds, endSeconds } = normalizeRange(input.range);
  const duration = Math.max(0.1, endSeconds - startSeconds);
  const base = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    startSeconds.toFixed(3),
    "-i",
    input.inputPath,
    "-t",
    duration.toFixed(3),
  ];

  if (input.kind === "audio")
    return [...base, "-vn", "-c:a", "copy", input.outputPath];

  if (input.kind === "video") return [...base, "-c", "copy", input.outputPath];

  // Vertical: fill a 1080×1920 frame by cropping the centre of the source to 9:16, then
  // scaling. Cropping rather than letterboxing — a short with bars top and bottom is the
  // thing this format exists to avoid.
  return [
    ...base,
    "-vf",
    "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=1080:1920:flags=lanczos,setsar=1",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    input.outputPath,
  ];
}
