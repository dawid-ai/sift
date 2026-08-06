export const SUMMARY_SYSTEM_PROMPT =
  "You are an expert at summarizing spoken-word transcripts (podcasts, talks, meetings, videos). " +
  "Produce a clear, well-organized summary that captures the key points, decisions, and notable quotes " +
  "without inventing information that is not present in the transcript.";

/** On-screen text read off one kept video frame (a slide/chart), tagged by timestamp. */
export interface FrameNote {
  tsMs: number;
  text: string;
}

/** `12345` ms → `00:12` (or `1:02:03` past an hour). */
function formatTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Assembles the AI content: the prompt, the transcript, and — when frames were
 * extracted — a timestamped list of on-screen slide text. Kept as a separate section
 * (not interleaved) so the model correlates it to the transcript by timestamp; this
 * stays text-only, so no AI provider needs an image/vision code path. With no frames
 * the output is byte-identical to the transcript-only form.
 */
export function assembleSummaryContent(
  promptBody: string,
  transcriptText: string,
  frames: FrameNote[] = [],
): string {
  const base = `${promptBody.trim()}\n\n----- TRANSCRIPT -----\n${transcriptText.trim()}`;
  const slides = frames.filter((f) => f.text.trim());
  if (slides.length === 0) return base;
  const lines = slides.map((f) => `[${formatTimestamp(f.tsMs)}] ${f.text.trim()}`).join("\n");
  return `${base}\n\n----- ON-SCREEN TEXT (SLIDES) -----\n${lines}`;
}
