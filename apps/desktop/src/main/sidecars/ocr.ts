import { createWorker, type Worker } from "tesseract.js";

export interface OcrResult {
  text: string;
  wordCount: number;
  meanConfidence: number; // 0..100
}

/** Shape a raw Tesseract result into the fields the keep-frame gate reads. */
export function toOcrResult(rawText: string, confidence: number): OcrResult {
  const text = rawText.trim();
  return {
    text,
    wordCount: text ? text.split(/\s+/).length : 0,
    meanConfidence: confidence,
  };
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
  /** Dir holding a bundled, uncompressed `<lang>.traineddata` (not `.gz`) so OCR skips the
   * CDN. Paired automatically with `gzip: false` in `workerOptions` below — tesseract.js
   * defaults to expecting a gzipped file for any local langPath, and a plain file read
   * under that default hangs the worker forever instead of erroring (see workerOptions). */
  langPath?: string;
  /** Dir to persist a downloaded `<lang>.traineddata` so it's fetched at most once. */
  cachePath?: string;
  language?: string;
}

/** The subset of tesseract.js's worker options this runner sets. */
export interface WorkerOptions {
  langPath?: string;
  cachePath?: string;
  gzip?: boolean;
}

/**
 * Builds tesseract.js worker options from `OcrDeps`. Pulled out as its own pure,
 * exported function so the langPath/gzip pairing is unit-testable without booting the
 * real WASM recognizer (see ocr.test.ts) — tests inject `makeRecognizer` and never reach
 * `defaultRecognizer`, which is exactly how a wrong default here would previously have
 * shipped silently: tesseract.js defaults `gzip` to `true`, and with a local `langPath` it
 * then looks for `<lang>.traineddata.gz`. The bundled resources/tessdata file is the plain,
 * uncompressed upstream format, so `gzip: false` must always accompany a set `langPath`.
 */
export function workerOptions(deps: OcrDeps): WorkerOptions {
  const options: WorkerOptions = {};
  if (deps.langPath) {
    options.langPath = deps.langPath;
    options.gzip = false;
  }
  if (deps.cachePath) options.cachePath = deps.cachePath;
  return options;
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
  const worker: Worker = await createWorker(
    deps.language ?? "eng",
    undefined,
    workerOptions(deps),
  );
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
