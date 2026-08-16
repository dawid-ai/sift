// Friendly display names for transcript provider ids. `TranscriptRecord.providerId` is an
// internal registry slug ("ytdlp-subs") — it is a key, never user-facing copy, so every surface
// that shows where a transcript came from runs it through here first. Unknown ids fall back to
// the raw slug so a newly registered provider still shows something rather than nothing.
//
// "Captions" (not "YouTube captions"): the yt-dlp subtitle provider serves every extractor
// yt-dlp supports, so naming one platform in the label would be wrong on a Vimeo/Twitch item.
const LABELS: Record<string, string> = {
  "ytdlp-subs": "Captions",
  whisper: "Whisper",
};

/** Human label for a transcript provider id ("ytdlp-subs" → "Captions"), else the raw id. */
export function transcriptProviderLabel(id: string): string {
  return LABELS[id.toLowerCase()] ?? id;
}
