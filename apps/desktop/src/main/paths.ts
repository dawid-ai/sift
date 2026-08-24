import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { branding, isKeyedAiProviderId } from "@sift/core";

/** Directory where managed binaries (yt-dlp, ffmpeg) are installed. Survives app updates. */
export function binariesDir(): string {
  return join(app.getPath("userData"), "binaries");
}

/** Directory the whisper.cpp binary folder (cli + shared libs) is extracted into. */
export function whisperDir(): string {
  return join(binariesDir(), "whisper");
}

/** Directory the whisper model file (ggml-small.bin) is downloaded into. Survives app updates. */
export function whisperModelsDir(): string {
  return join(app.getPath("userData"), "whisper-models");
}

/** Default directory where downloaded media is saved: the OS Downloads folder, in an app
 * subfolder. Used as the fallback `defaultDir` for the downloads-config store — the live,
 * user-overridable value comes from that store, not this function, once it's constructed. */
export function downloadsDir(): string {
  return join(app.getPath("downloads"), branding.appName);
}

/** Path to the downloads-path override config (non-secret). */
export function downloadsConfigFile(): string {
  return join(app.getPath("userData"), "settings", "downloads.json");
}

/** Path to the persisted queue settings (concurrency + scheduled start, non-secret). */
export function queueConfigFile(): string {
  return join(app.getPath("userData"), "settings", "queue.json");
}

/** Path to the persisted proxy URL used for yt-dlp and remote AI providers (non-secret —
 * but it can carry proxy credentials, so it is not included in the diagnostics bundle). */
export function networkConfigFile(): string {
  return join(app.getPath("userData"), "settings", "network.json");
}

/** Path to the persisted channel refresh schedule + notification toggles (non-secret). */
export function channelRefreshConfigFile(): string {
  return join(app.getPath("userData"), "settings", "channel-refresh.json");
}

/** Path to the watched-folder list plus the paths already imported from them (non-secret). */
export function watchFoldersConfigFile(): string {
  return join(app.getPath("userData"), "settings", "watch-folders.json");
}

/** Path to the selected Whisper model, its language, and the OCR language (non-secret). */
export function whisperConfigFile(): string {
  return join(app.getPath("userData"), "settings", "whisper.json");
}

/** Path to the persisted binary auto-update policy (auto|notify, non-secret). */
export function binaryUpdatesConfigFile(): string {
  return join(app.getPath("userData"), "settings", "binary-updates.json");
}

/** Ensures `dir` exists, creating intermediate directories as needed. */
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/** Path to the encrypted-at-rest API key blob for a given provider. Survives app updates.
 *
 * SECURITY: `providerId` originates in the renderer, so it is checked against the keyed
 * provider allowlist rather than interpolated into a path. Without this, an id such as
 * `../../config` escapes the secrets directory and lets a compromised renderer read or
 * overwrite arbitrary files under userData. */
export function secretsFile(providerId: string): string {
  if (!isKeyedAiProviderId(providerId))
    throw new Error(`Unknown AI provider: ${providerId}`);
  return join(app.getPath("userData"), "secrets", `${providerId}.key`);
}

/**
 * Path to the custom (OpenAI-compatible) provider's non-secret config (base_url + model).
 * Co-located with the `secrets/` dir for convenience, but NOT encrypted — the API key
 * itself stays in `secretsFile("custom")` via `safeStorage`.
 */
export function customConfigFile(): string {
  return join(app.getPath("userData"), "secrets", "custom-config.json");
}

/** Ordered preferred transcript languages (non-secret). */
export function transcriptConfigFile(): string {
  return join(app.getPath("userData"), "settings", "transcript.json");
}

/** Persisted default AI provider + model (seeds every provider picker; non-secret). */
export function aiDefaultConfigFile(): string {
  return join(app.getPath("userData"), "settings", "ai-default.json");
}

/** Path to the persisted "auto-fetch transcript after download" toggle (non-secret). */
export function autoTranscriptConfigFile(): string {
  return join(app.getPath("userData"), "settings", "auto-transcript.json");
}

/** Path to the persisted default transcript-method override (non-secret). */
export function transcriptMethodConfigFile(): string {
  return join(app.getPath("userData"), "settings", "transcript-method.json");
}

/** Local cache of downloaded channel/subscription thumbnails (served via the sift-thumb:// protocol). */
export function thumbnailsDir(): string {
  return join(app.getPath("userData"), "thumbnails");
}

/** Poster frames extracted from imported local files (served via sift-poster://). Separate
 * from thumbnailsDir(), which is a remote-URL cache with a host allowlist and can't serve a
 * local file, and from framesDir(), which belongs to the Slides flow. */
export function postersDir(): string {
  return join(app.getPath("userData"), "posters");
}

/** Root of all extracted slide frames. Used to serve them via the sift-frame:// protocol. */
export function framesRootDir(): string {
  return join(app.getPath("userData"), "frames");
}

/** Per-media directory of extracted slide frames (frame-0001.jpg …). Survives app updates. */
export function framesDir(mediaId: number): string {
  return join(framesRootDir(), String(mediaId));
}

/** Where Tesseract caches the downloaded `<lang>.traineddata` (fetched at most once). */
export function tesseractCacheDir(): string {
  return join(app.getPath("userData"), "tesseract");
}

/** Directory holding the bundled `eng.traineddata`, so OCR never needs the CDN.
 * Packaged: unpacked next to the asar via electron-builder `extraResources`. Dev: the
 * source tree copy. */
export function tessdataDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "tessdata")
    : join(app.getAppPath(), "resources", "tessdata");
}

/** The single exported yt-dlp cookies.txt for the whole sign-in session.
 * NOTE: the folder must NOT be "cookies" — on case-insensitive Windows that collides with
 * Chromium's reserved `Cookies` network-store file, which then can't be migrated/deleted
 * ("Failed to delete file …\\Cookies: The directory is not empty"). Use a distinct name. */
export function cookiesFile(): string {
  return join(app.getPath("userData"), "yt-dlp-cookies", "auth.txt");
}
