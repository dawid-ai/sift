// Structured IPC payload guards, built on the primitives in `./validate`.
//
// These re-check the object shapes that reach a child process (yt-dlp selectors, URLs),
// the filesystem, or SQL. Fields that are only rendered back to the UI are length-capped
// rather than parsed field-by-field: the goal is to stop injection and unbounded input,
// not to re-implement the type system at runtime.

import type {
  AiDefaultConfig,
  ChannelVideosQuery,
  CustomProviderConfig,
  DownloadOption,
  MediaFilter,
  MediaMetadata,
  QueueConfig,
  QueueSpec,
} from "@sift/ipc-contract";
import type { FrameCrop } from "@sift/db";
import {
  bool,
  httpUrl,
  id,
  idArray,
  int,
  mediaSourceUrl,
  nonEmptyStr,
  num,
  obj,
  oneOf,
  optional,
  str,
  strArray,
} from "./validate";

function nullableStr(v: unknown, name: string, max = 8192): string | null {
  return v === null || v === undefined ? null : str(v, name, max);
}

function nullableInt(
  v: unknown,
  name: string,
  min: number,
  max: number,
): number | null {
  return v === null || v === undefined ? null : int(v, name, min, max);
}

export function mediaFilter(v: unknown): MediaFilter {
  if (v === undefined || v === null) return {};
  const f = obj(v, "filter");
  return {
    tags: f.tags == null ? null : strArray(f.tags, "filter.tags", 200, 200),
    channel: nullableStr(f.channel, "filter.channel", 500),
    platform: nullableStr(f.platform, "filter.platform", 100),
    from: nullableInt(f.from, "filter.from", 0, Number.MAX_SAFE_INTEGER),
    to: nullableInt(f.to, "filter.to", 0, Number.MAX_SAFE_INTEGER),
    ids: f.ids == null ? null : idArray(f.ids, "filter.ids"),
    excludeTags:
      f.excludeTags == null
        ? null
        : strArray(f.excludeTags, "filter.excludeTags", 200, 200),
    publishedFrom: nullableInt(
      f.publishedFrom,
      "filter.publishedFrom",
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    publishedTo: nullableInt(
      f.publishedTo,
      "filter.publishedTo",
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    // A day of seconds is the ceiling for a sane duration bound; anything longer is a typo
    // and would only ever match nothing.
    durationMin: nullableInt(
      f.durationMin,
      "filter.durationMin",
      0,
      86_400 * 30,
    ),
    durationMax: nullableInt(
      f.durationMax,
      "filter.durationMax",
      0,
      86_400 * 30,
    ),
    favourite:
      f.favourite == null ? null : bool(f.favourite, "filter.favourite"),
    collectionId:
      f.collectionId == null ? null : id(f.collectionId, "filter.collectionId"),
    missing:
      f.missing == null
        ? null
        : oneOf<NonNullable<MediaFilter["missing"]>>(
            f.missing,
            "filter.missing",
            ["transcript", "summary", "download"],
          ),
    downloadStatus:
      f.downloadStatus == null
        ? null
        : oneOf(f.downloadStatus, "filter.downloadStatus", [
            "none",
            "downloading",
            "done",
            "error",
          ]),
  };
}

/** A yt-dlp format choice. `selector` becomes an argv value for the `-f` flag, so it is
 * length-capped and kept free of control characters. */
export function downloadOption(v: unknown, name = "option"): DownloadOption {
  const o = obj(v, name);
  const selector = nonEmptyStr(o.selector, `${name}.selector`, 512);
  // A charCode scan rather than a regex: a control-character class trips eslint's
  // no-control-regex, and rejecting those characters is the whole point here.
  if ([...selector].some((c) => c.charCodeAt(0) < 0x20))
    throw new Error(
      `Invalid IPC argument "${name}.selector": control characters.`,
    );
  return {
    id: nonEmptyStr(o.id, `${name}.id`, 128),
    label: str(o.label ?? "", `${name}.label`, 256),
    detail: str(o.detail ?? "", `${name}.detail`, 256),
    selector,
    approxBytes: nullableInt(
      o.approxBytes,
      `${name}.approxBytes`,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    kind: oneOf(o.kind, `${name}.kind`, ["video", "audio"] as const),
  };
}

/** Normalized yt-dlp metadata. `sourceUrl` is the field that reaches the network and the
 * child process, so it is fully parsed; the rest is bounded. `raw` is passed through — it
 * is only ever re-serialized into the database, never interpreted. */
export function mediaMetadata(v: unknown, name = "metadata"): MediaMetadata {
  const m = obj(v, name);
  const platform = obj(m.platform, `${name}.platform`);
  return {
    sourceUrl: mediaSourceUrl(m.sourceUrl, `${name}.sourceUrl`),
    platform: {
      id: nonEmptyStr(platform.id, `${name}.platform.id`, 100),
      label: str(platform.label ?? "", `${name}.platform.label`, 200),
      tier: oneOf(platform.tier, `${name}.platform.tier`, [
        "tested",
        "supported",
        "unknown",
      ] as const),
    },
    externalId: nullableStr(m.externalId, `${name}.externalId`, 200),
    title: str(m.title ?? "", `${name}.title`, 2000),
    uploader: nullableStr(m.uploader, `${name}.uploader`, 500),
    uploaderUrl: nullableStr(m.uploaderUrl, `${name}.uploaderUrl`, 2000),
    channelId: nullableStr(m.channelId, `${name}.channelId`, 200),
    durationSec:
      m.durationSec == null
        ? null
        : num(m.durationSec, `${name}.durationSec`, 0, 1e7),
    thumbnailUrl: nullableStr(m.thumbnailUrl, `${name}.thumbnailUrl`, 2000),
    viewCount: nullableInt(
      m.viewCount,
      `${name}.viewCount`,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    likeCount: nullableInt(
      m.likeCount,
      `${name}.likeCount`,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    uploadDate: nullableStr(m.uploadDate, `${name}.uploadDate`, 32),
    hasCaptions: bool(m.hasCaptions ?? false, `${name}.hasCaptions`),
    language: nullableStr(m.language, `${name}.language`, 32),
    captionLanguages: strArray(
      m.captionLanguages ?? [],
      `${name}.captionLanguages`,
      500,
      32,
    ),
    formats: Array.isArray(m.formats)
      ? m.formats.map((f, i) => downloadOption(f, `${name}.formats[${i}]`))
      : [],
    raw: m.raw,
  };
}

export function queueSpec(v: unknown, name = "spec"): QueueSpec {
  const s = obj(v, name);
  const format = obj(s.format, `${name}.format`);
  const summarize =
    s.summarize == null ? null : obj(s.summarize, `${name}.summarize`);
  return {
    format: {
      kind: oneOf(format.kind, `${name}.format.kind`, [
        "video",
        "audio",
      ] as const),
      maxHeight:
        format.maxHeight == null
          ? null
          : int(format.maxHeight, `${name}.format.maxHeight`, 1, 20_000),
      mp4: bool(format.mp4 ?? false, `${name}.format.mp4`),
    },
    download: bool(s.download, `${name}.download`),
    transcript: bool(s.transcript, `${name}.transcript`),
    summarize:
      summarize === null
        ? null
        : ({
            providerId: nonEmptyStr(
              summarize.providerId,
              `${name}.summarize.providerId`,
              100,
            ),
            model: nonEmptyStr(summarize.model, `${name}.summarize.model`, 200),
            promptId:
              optional(summarize.promptId, (x) =>
                id(x, `${name}.summarize.promptId`),
              ) ?? null,
          } as QueueSpec["summarize"]),
    tags: strArray(s.tags ?? [], `${name}.tags`, 100, 200),
  };
}

/** Slide crop rectangle, in the 0..1 fractions the extractor expects. A rectangle that
 * runs past the frame edge produces an ffmpeg filter error rather than a crop, so the
 * bounds are enforced here. */
export function frameCrop(v: unknown, name = "crop"): FrameCrop {
  const c = obj(v, name);
  const x = num(c.x, `${name}.x`, 0, 1);
  const y = num(c.y, `${name}.y`, 0, 1);
  const w = num(c.w, `${name}.w`, 0.001, 1);
  const h = num(c.h, `${name}.h`, 0.001, 1);
  if (x + w > 1.0001 || y + h > 1.0001)
    throw new Error(
      `Invalid IPC argument "${name}": rectangle extends past the frame.`,
    );
  return { x, y, w, h };
}

/** Custom OpenAI-compatible endpoint. `baseUrl` is where API keys get sent, so a
 * non-http(s) scheme is refused outright. */
export function customProviderConfig(
  v: unknown,
  name = "config",
): CustomProviderConfig {
  const c = obj(v, name);
  return {
    baseUrl: httpUrl(c.baseUrl, `${name}.baseUrl`),
    model: nonEmptyStr(c.model, `${name}.model`, 200),
  };
}

export function aiDefaultConfig(
  v: unknown,
  name = "config",
): AiDefaultConfig | null {
  if (v === null || v === undefined) return null;
  const c = obj(v, name);
  return {
    providerId: nonEmptyStr(c.providerId, `${name}.providerId`, 100),
    model: nonEmptyStr(c.model, `${name}.model`, 200),
  };
}

export function channelVideosQuery(
  v: unknown,
  name = "query",
): ChannelVideosQuery {
  const q = obj(v, name);
  return {
    contentType: oneOf(q.contentType, `${name}.contentType`, [
      "videos",
      "shorts",
      "live",
    ] as const),
    order: oneOf(q.order, `${name}.order`, [
      "latest",
      "oldest",
      "most_viewed",
    ] as const),
    count: int(q.count, `${name}.count`, 1, 5000),
  };
}

/** Queue behaviour. `startAt` is an absolute epoch ms; a value in the past is a valid (if
 * odd) request, so only the type and a sane bound are enforced. */
export function queueConfig(v: unknown, name = "config"): QueueConfig {
  const c = obj(v, name);
  return {
    concurrency: int(c.concurrency, `${name}.concurrency`, 1, 4),
    startAt:
      c.startAt == null
        ? null
        : int(c.startAt, `${name}.startAt`, 0, Number.MAX_SAFE_INTEGER),
  };
}
