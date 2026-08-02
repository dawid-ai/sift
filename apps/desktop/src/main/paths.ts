import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { branding } from "@sift/core";

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

/** Ensures `dir` exists, creating intermediate directories as needed. */
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/** Path to the encrypted-at-rest API key blob for a given provider. Survives app updates. */
export function secretsFile(providerId: string): string {
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

/** The single exported yt-dlp cookies.txt for the whole sign-in session.
 * NOTE: the folder must NOT be "cookies" — on case-insensitive Windows that collides with
 * Chromium's reserved `Cookies` network-store file, which then can't be migrated/deleted
 * ("Failed to delete file …\\Cookies: The directory is not empty"). Use a distinct name. */
export function cookiesFile(): string {
  return join(app.getPath("userData"), "yt-dlp-cookies", "auth.txt");
}
