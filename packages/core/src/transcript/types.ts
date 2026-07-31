export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptContext {
  sourceUrl: string;
  hasCaptions: boolean;
  language: string; // preferred language, e.g. "en"
  captionLanguages: string[]; // available caption languages ([] when unknown); used to decide caption-vs-whisper
  audioPath: string | null; // 4a: always null; 4b whisper uses it
  cookiesFile?: string | null; // 8: yt-dlp --cookies path when the platform is signed in
}

export interface TranscriptResult {
  providerId: string;
  language: string;
  text: string; // full transcript (segments joined by "\n")
  segments: TranscriptSegment[];
  model: string | null; // 4a: null; whisper sets its model name
}

export type TranscriptProgressFn = (p: { stage: string; ratio: number | null }) => void;

export interface TranscriptProvider {
  id: string;
  label: string;
  local?: boolean; // true = local engine (whisper); used by method policy
  canHandle(ctx: TranscriptContext): boolean;
  transcribe(ctx: TranscriptContext, onProgress: TranscriptProgressFn): Promise<TranscriptResult>;
}

/** User-selectable transcript source policy (settings:getTranscriptLanguages' sibling knob).
 * Core-local (like other transcript types) — no @sift/ipc-contract; re-exported by the contract. */
export type TranscriptMethod = "auto" | "prefer_whisper" | "captions_only";
