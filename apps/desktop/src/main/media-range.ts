import { extname } from "node:path";

/** A resolved byte range, inclusive of both ends (HTTP Range semantics). */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Parses an HTTP `Range` header against a known file size into an inclusive
 * `{start,end}`. Returns `null` when there is no range to honor (absent or
 * malformed header → caller serves the full 200 body). Returns `"unsatisfiable"`
 * when the range is syntactically valid but out of bounds (caller returns 416).
 *
 * Only the first range of a single-range request is honored — the `<video>`
 * element never sends multi-range requests. Supported forms: `bytes=start-end`,
 * `bytes=start-` (to EOF), `bytes=-suffix` (last N bytes).
 */
export function parseRange(
  header: string | null,
  size: number,
): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;
  if (rawStart === "") {
    // Suffix range: the last `rawEnd` bytes.
    const suffix = Number(rawEnd);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (start > end || start >= size) return "unsatisfiable";
  return { start, end };
}

const MEDIA_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
};

/** Maps a downloaded file's extension to a media MIME type so the `<video>`
 * element gets a real `Content-Type` (defaults to a generic binary type). */
export function mediaContentType(filePath: string): string {
  return (
    MEDIA_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream"
  );
}
