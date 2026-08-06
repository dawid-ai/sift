import { readFileSync } from "node:fs";
import { DEFAULT_OLLAMA_BASE_URL } from "../ai/ollama-provider";

/** Decides whether a candidate frame is worth keeping (a slide/chart) vs noise. */
export interface FrameClassifier {
  /** true = keep (slide/chart/document); false = drop (talking head, room, webcam, …). */
  classify(imagePath: string): Promise<boolean>;
}

const SLIDE_PROMPT =
  "Look at this single video frame. Answer with ONLY one word, 'yes' or 'no'. " +
  "Is it primarily a presentation slide, chart, diagram, or document with readable text or data " +
  "that fills most of the frame — as opposed to a talking head, an audience, a room, a webcam, or " +
  "blurry camera footage? Answer 'no' if a person or a scene is the main subject.";

/** Turns the model's free-text answer into keep(true)/drop(false). Unknown → keep (fail-open). */
export function parseSlideAnswer(text: string): boolean {
  const t = text.trim().toLowerCase();
  const first = t.match(/[a-z]+/)?.[0] ?? "";
  if (first === "yes") return true;
  if (first === "no" || first === "not") return false;
  // No clear leading yes/no — keep unless it explicitly says it's not a slide.
  return !/\bnot?\b.{0,20}\b(slide|chart|presentation|diagram)\b/.test(t);
}

/**
 * Slide classifier backed by a current-engine Ollama vision model (qwen2.5vl, minicpm-v, gemma3).
 * Posts the frame as base64 to `/api/chat` with a yes/no prompt. Throws a clear error when the
 * daemon is unreachable or the model isn't pulled, so a misconfigured run fails loudly rather
 * than silently keeping everything.
 */
export function createOllamaSlideClassifier(deps: {
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  readImage?: (path: string) => Buffer;
}): FrameClassifier {
  const baseUrl = deps.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const readImage = deps.readImage ?? readFileSync;
  return {
    async classify(imagePath) {
      const b64 = readImage(imagePath).toString("base64");
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: deps.model,
            stream: false,
            messages: [{ role: "user", content: SLIDE_PROMPT, images: [b64] }],
            options: { temperature: 0 },
          }),
        });
      } catch {
        throw new Error(`Could not reach Ollama at ${baseUrl}. Is it running?`);
      }
      if (!res.ok) {
        throw new Error(
          `Ollama slide detection failed for model "${deps.model}" (HTTP ${res.status}). Is the vision model pulled?`,
        );
      }
      const json = (await res.json()) as { message?: { content?: string } };
      return parseSlideAnswer(json.message?.content ?? "");
    },
  };
}
