/** Containers ffmpeg reliably decodes and the `<video>` element can probe, bare (no
 * leading dot) because Electron's `dialog.showOpenDialog` filter wants them that way.
 * Shared by the renderer's drop filter and the main-process file picker so the two
 * entry points can never accept different sets. */
export const MEDIA_EXTENSIONS = [
  "mp4",
  "mkv",
  "webm",
  "mov",
  "avi",
  "m4v",
  "mp3",
  "m4a",
  "aac",
  "wav",
  "flac",
  "ogg",
  "opus",
  "wma",
] as const;

const ALLOWED = new Set<string>(MEDIA_EXTENSIONS);

/** True when `filename` ends in a supported media extension. Rejects extensionless
 * names and dotfiles (".gitignore" is not a ".gitignore-format media file"). */
export function isMediaFile(filename: string): boolean {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return false;
  return ALLOWED.has(filename.slice(dot + 1).toLowerCase());
}
