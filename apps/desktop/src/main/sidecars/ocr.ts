import { createWorker, type Worker } from "tesseract.js";

export interface OcrResult {
  text: string;
  wordCount: number;
  meanConfidence: number; // 0..100
}

/** Shape a raw Tesseract result into the fields the keep-frame gate reads. */
export function toOcrResult(rawText: string, confidence: number): OcrResult {
  const text = rawText.trim();
  return { text, wordCount: text ? text.split(/\s+/).length : 0, meanConfidence: confidence };
}

/** Minimal shape `createOcrRunner` depends on — injectable so tests skip the WASM. */
export interface Recognizer {
  recognize(imagePath: string): Promise<{ text: string; confidence: number }>;
  close(): Promise<void>;
}

export interface OcrRunner {
  recognize(imagePath: string): Promise<OcrResult>;
  close(): Promise<void>;
}

export interface OcrDeps {
  makeRecognizer?: () => Promise<Recognizer>;
  /** Dir holding a bundled `<lang>.traineddata` — set this to run fully offline (see below). */
  langPath?: string;
  /** Dir to persist a downloaded `<lang>.traineddata` so it's fetched at most once. */
  cachePath?: string;
  language?: string;
}

/**
 * One Tesseract worker reused across every frame of a video (worker spin-up is the
 * expensive part). Lazily created on first recognize, terminated on close.
 *
 * ponytail: `langPath` points at the bundled `eng.traineddata` (see paths.tessdataDir), so
 * first-run OCR is fully offline. `cachePath` remains as a fallback if langPath is ever unset.
 * English only — add more traineddata files to resources/tessdata if non-Latin slides matter.
 */
export function createOcrRunner(deps: OcrDeps = {}): OcrRunner {
  const make = deps.makeRecognizer ?? (() => defaultRecognizer(deps));
  let recognizerP: Promise<Recognizer> | null = null;
  const recognizer = (): Promise<Recognizer> => (recognizerP ??= make());
  return {
    async recognize(imagePath) {
      const r = await recognizer();
      const { text, confidence } = await r.recognize(imagePath);
      return toOcrResult(text, confidence);
    },
    async close() {
      if (!recognizerP) return;
      await (await recognizerP).close();
      recognizerP = null;
    },
  };
}

async function defaultRecognizer(deps: OcrDeps): Promise<Recognizer> {
  const options: { langPath?: string; cachePath?: string } = {};
  if (deps.langPath) options.langPath = deps.langPath;
  if (deps.cachePath) options.cachePath = deps.cachePath;
  const worker: Worker = await createWorker(deps.language ?? "eng", undefined, options);
  return {
    async recognize(imagePath) {
      const { data } = await worker.recognize(imagePath);
      return { text: data.text, confidence: data.confidence };
    },
    close: async () => {
      await worker.terminate();
    },
  };
}
