import type { TranscriptSegment } from "./types";

interface Json3Seg { utf8?: string }
interface Json3Event { tStartMs?: number; dDurationMs?: number; segs?: Json3Seg[] }

/** Parse YouTube timedtext json3 into clean segments (one per caption event, no rolling
 *  duplication). Malformed input → []. Never throws. */
export function parseJson3(raw: string): TranscriptSegment[] {
  let parsed: { events?: Json3Event[] } | null;
  try {
    parsed = JSON.parse(raw) as { events?: Json3Event[] };
  } catch {
    return [];
  }
  const events = parsed?.events;
  if (!Array.isArray(events)) return [];
  const out: TranscriptSegment[] = [];
  for (const ev of events) {
    if (!Array.isArray(ev.segs)) continue;
    const text = ev.segs.map((s) => s.utf8 ?? "").join("").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const start = (ev.tStartMs ?? 0) / 1000;
    const end = ((ev.tStartMs ?? 0) + (ev.dDurationMs ?? 0)) / 1000;
    const prev = out[out.length - 1];
    if (prev && prev.text === text) continue;
    out.push({ start, end, text });
  }
  return out;
}
