import { baseLangCode, resolvePlatform } from "@sift/core";
import type { MediaMetadata } from "@sift/ipc-contract";
import { isAuthError } from "../auth/status";
import type { YtDlpRunner } from "../sidecars/ytdlp";
import { computeDownloadOptions } from "./download-options";

/** Coerces an unknown value into a finite number, or `null` if it isn't one. */
function toNumberOrNull(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

/** Coerces an unknown value into a string, or `null` if it isn't a non-empty string. */
function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** True if `value` is a plain object with at least one own key. */
function isNonEmptyObject(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

/** yt-dlp reports captions via `subtitles` (manual) and/or `automatic_captions`. */
function hasAnyCaptions(raw: Record<string, unknown>): boolean {
  return isNonEmptyObject(raw.subtitles) || isNonEmptyObject(raw.automatic_captions);
}

/** Base-language codes present across yt-dlp's `subtitles` + `automatic_captions`, deduped. */
function captionLanguages(raw: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const key of ["subtitles", "automatic_captions"] as const) {
    const dict = raw[key];
    if (typeof dict === "object" && dict !== null && !Array.isArray(dict)) {
      for (const code of Object.keys(dict)) {
        const base = baseLangCode(code);
        if (base) out.add(base);
      }
    }
  }
  return [...out];
}

/**
 * Maps a raw yt-dlp `-J` dump (loosely typed, field presence varies by extractor)
 * into the app's normalized `MediaMetadata` shape. Never throws on missing/malformed
 * fields — everything not present or not the expected type maps to `null`.
 */
export function normalizeMetadata(raw: unknown, sourceUrl: string): MediaMetadata {
  const record: Record<string, unknown> =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const extractorKey = record.extractor_key;

  return {
    sourceUrl,
    platform: resolvePlatform(typeof extractorKey === "string" ? extractorKey : null),
    externalId: toStringOrNull(record.id),
    title: toStringOrNull(record.title) ?? "",
    uploader: toStringOrNull(record.uploader) ?? toStringOrNull(record.channel),
    uploaderUrl: toStringOrNull(record.uploader_url) ?? toStringOrNull(record.channel_url),
    channelId: toStringOrNull(record.channel_id),
    durationSec: toNumberOrNull(record.duration),
    thumbnailUrl: toStringOrNull(record.thumbnail),
    viewCount: toNumberOrNull(record.view_count),
    likeCount: toNumberOrNull(record.like_count),
    uploadDate: toStringOrNull(record.upload_date),
    hasCaptions: hasAnyCaptions(record),
    language: (() => {
      const l = toStringOrNull(record.language);
      return l ? baseLangCode(l) : null;
    })(),
    captionLanguages: captionLanguages(record),
    formats: computeDownloadOptions(raw),
    raw,
  };
}

export interface MetadataServiceOpts {
  getCookiesFile?: (url: string) => Promise<string | null>;
  reportAuthFailure?: (url: string) => void;
}

/** Fetches yt-dlp metadata for a URL and normalizes it into `MediaMetadata`. */
export class MetadataService {
  constructor(
    private readonly runner: YtDlpRunner,
    private readonly opts: MetadataServiceOpts = {},
  ) {}

  async fetch(url: string): Promise<MediaMetadata> {
    const getCookiesFile = this.opts.getCookiesFile ?? (async () => null);
    const cookiesFile = (await getCookiesFile(url)) ?? undefined;
    let raw: unknown;
    try {
      raw = await this.runner.dumpJson(url, cookiesFile);
    } catch (err) {
      if (cookiesFile && isAuthError(err instanceof Error ? err.message : String(err))) {
        this.opts.reportAuthFailure?.(url);
        throw new Error(
          `${err instanceof Error ? err.message : String(err)} — your ${new URL(url).host} session may have expired. Settings → Accounts → Sign in again.`,
        );
      }
      throw err;
    }
    return normalizeMetadata(raw, url);
  }

  async listExtractors(): Promise<string[]> {
    return this.runner.listExtractors();
  }
}
