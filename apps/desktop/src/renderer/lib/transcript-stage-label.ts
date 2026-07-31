const STAGE_LABELS: Record<string, string> = {
  "extracting-audio": "Extracting audio…",
  transcribing: "Transcribing…",
  "fetching-subtitles": "Fetching subtitles…",
};

/** Maps a `transcript:progress` stage to a human-readable label; unknown stages
 * (and `null`, meaning no progress event has landed yet) fall back to "Working…". */
export function transcriptStageLabel(stage: string | null): string {
  if (!stage) return "Working…";
  return STAGE_LABELS[stage] ?? "Working…";
}
