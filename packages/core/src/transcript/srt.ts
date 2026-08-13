import type { TranscriptSegment } from "./types";

/** `3723.456` s → `01:02:03,456` (SubRip timestamp). */
function srtTime(seconds: number): string {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
  return (
    `${pad(Math.floor(ms / 3_600_000))}:` +
    `${pad(Math.floor((ms % 3_600_000) / 60_000))}:` +
    `${pad(Math.floor((ms % 60_000) / 1000))},` +
    `${pad(ms % 1000, 3)}`
  );
}

/**
 * Serialises transcript segments to SubRip (.srt). Blank segments are dropped without
 * gapping the cue numbering, and a cue whose end is not after its start gets a one-second
 * duration — some players silently discard zero-length cues, and auto-caption segments
 * occasionally carry equal start/end times.
 */
export function segmentsToSrt(segments: TranscriptSegment[]): string {
  const cues: string[] = [];
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    const end = seg.end > seg.start ? seg.end : seg.start + 1;
    cues.push(`${cues.length + 1}\n${srtTime(seg.start)} --> ${srtTime(end)}\n${text}`);
  }
  return cues.length ? `${cues.join("\n\n")}\n` : "";
}
