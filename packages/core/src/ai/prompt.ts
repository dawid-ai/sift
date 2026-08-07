export const SUMMARY_SYSTEM_PROMPT =
  "You are an expert at summarizing spoken-word transcripts (podcasts, talks, meetings, videos). " +
  "Produce a clear, well-organized summary that captures the key points, decisions, and notable quotes " +
  "without inventing information that is not present in the transcript.";

/**
 * Distills a raw talk/lecture transcript into a written knowledge document — NOT a cleaned-up
 * transcript and NOT a short summary. Used by the AI-polished document export. The transcript is
 * fed whole, with `[[SLIDE n]]` markers where each slide appears; the model keeps the markers
 * (repositioned) so the images can be re-inserted around the distilled text.
 */
export const POLISH_SYSTEM_PROMPT = [
  "You turn a raw talk or lecture transcript into a dense, written KNOWLEDGE DOCUMENT.",
  "",
  "Keep ONLY substance: facts, data, numbers, definitions, methods, mechanisms, arguments, results,",
  "and conclusions. Remove everything else — greetings, audience questions, calls for participation,",
  '"today we\'ll cover / let\'s discuss" meta and discovery, tangents, anecdotes that carry no',
  "information, filler, hedging, and repetition. Do NOT preserve the speaker's wording or sentence",
  "order; reorganize the material by topic. This is not a transcript and not a short summary — it is",
  "the knowledge, restructured. Capture every distinct fact and figure, but nothing that isn't knowledge.",
  "",
  "Write clean Markdown: `##`/`###` section headers, short paragraphs, and bullet lists where the",
  "content is a set of points, steps, or data. The document already has a title, so start at `##`.",
  "",
  "The transcript contains slide markers like `[[SLIDE 3]]`. Keep every marker exactly once, on its",
  "own line, moved to sit next to the content that slide illustrates. Do NOT describe, caption, or",
  "transcribe the slides — each marker is replaced by the slide image.",
  "",
  "Output only the finished document — no preamble, no closing remarks, no code fences.",
].join("\n");

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
