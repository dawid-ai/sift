import type { TranscriptSegment } from "./types";

const CUE_RE =
  /^(\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s+-->\s+(\d{2}:)?\d{2}:\d{2}[.,]\d{3}/;

function toSeconds(ts: string): number {
  // HH:MM:SS.mmm or MM:SS.mmm ; comma or dot decimal
  const [hms = "", msRaw = "0"] = ts.replace(",", ".").split(".");
  const parts = hms.split(":").map(Number);
  const hasHours = parts.length === 3;
  const h = hasHours ? (parts[0] ?? 0) : 0;
  const m = hasHours ? (parts[1] ?? 0) : (parts[0] ?? 0);
  const s = hasHours ? (parts[2] ?? 0) : (parts[1] ?? 0);
  return h * 3600 + m * 60 + s + Number(`0.${msRaw}`);
}

// strips <...> tags + collapses consecutive dup cues (covers YouTube rolling auto-subs);
// full segment de-overlap / word-timing reconstruction is deliberately skipped until a real case needs it.
export function parseVtt(vtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const blocks = vtt.replace(/\r\n/g, "\n").split(/\n\n+/);
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const timeIdx = lines.findIndex((l) => CUE_RE.test(l));
    if (timeIdx < 0) continue;
    const cueLine = lines[timeIdx];
    if (cueLine === undefined) continue;
    const m = cueLine.match(/^(\S+)\s+-->\s+(\S+)/);
    if (!m) continue;
    const startRaw = m[1];
    const endRaw = m[2];
    if (startRaw === undefined || endRaw === undefined) continue;
    const start = toSeconds(startRaw);
    const end = toSeconds(endRaw);
    const text = lines
      .slice(timeIdx + 1)
      .join(" ")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const prev = segments[segments.length - 1];
    if (prev && prev.text === text) continue; // collapse consecutive duplicates
    segments.push({ start, end, text });
  }
  return segments;
}

export function segmentsToText(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text).join("\n");
}
