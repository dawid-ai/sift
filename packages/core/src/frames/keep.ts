/** OCR summary for one candidate frame, used to decide if it carries data. */
export interface FrameOcr {
  wordCount: number;
  meanConfidence: number; // 0..100, Tesseract per-word confidence averaged
}

export interface KeepFrameOptions {
  minWords?: number;
  minConfidence?: number;
}

// ponytail: word-count + confidence gate is the real "is this data, not scenery?" filter.
// Slides/charts carry many crisp, high-confidence words; faces, scenery, and B-roll clear
// neither bar. Constants need a human tuning pass on real videos (720p slides run low);
// upgrade path is a VLM classifier behind the same boolean when OCR proves too shallow.
export const KEEP_FRAME_DEFAULTS = { minWords: 5, minConfidence: 60 } as const;

export function isDataFrame(
  ocr: FrameOcr,
  opts: KeepFrameOptions = {},
): boolean {
  const minWords = opts.minWords ?? KEEP_FRAME_DEFAULTS.minWords;
  const minConfidence = opts.minConfidence ?? KEEP_FRAME_DEFAULTS.minConfidence;
  return ocr.wordCount >= minWords && ocr.meanConfidence >= minConfidence;
}
