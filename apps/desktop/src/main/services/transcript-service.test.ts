import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { openTestDatabase } from "@sift/db/testing";
import {
  getMediaBySourceUrl,
  getTranscriptsByMediaId,
  insertDownload,
  insertMedia,
  insertTranscript,
  runMigrations,
} from "@sift/db";
import type { MediaMetadata } from "@sift/ipc-contract";
import { TranscriptRegistry } from "@sift/core";
import type { TranscriptProvider, TranscriptResult } from "@sift/core";
import { TranscriptService } from "./transcript-service";

const metadata: MediaMetadata = {
  sourceUrl: "https://example.com/watch?v=abc123",
  platform: { id: "youtube", label: "YouTube", tier: "tested" },
  externalId: "abc123",
  title: "Vid",
  uploader: "Chan",
  uploaderUrl: "https://example.com/chan",
  channelId: null,
  durationSec: 120,
  thumbnailUrl: "https://example.com/thumb.jpg",
  viewCount: 100,
  likeCount: 10,
  uploadDate: "20240101",
  hasCaptions: true,
  language: null,
  captionLanguages: ["en"],
  formats: [],
  raw: { some: "raw-field" },
};

/** A fake provider that always handles `ctx` and counts `transcribe` invocations. */
function makeFakeProvider(): { provider: TranscriptProvider; calls: () => number } {
  let calls = 0;
  const provider: TranscriptProvider = {
    id: "fake",
    label: "Fake",
    canHandle: () => true,
    async transcribe(): Promise<TranscriptResult> {
      calls++;
      return {
        providerId: "fake",
        language: "en",
        text: "hi",
        segments: [{ start: 0, end: 1, text: "hi" }],
        model: null,
      };
    },
  };
  return { provider, calls: () => calls };
}

/** A fake local (whisper-like) provider that always handles `ctx` and counts `transcribe` invocations. */
function makeFakeLocalProvider(opts?: {
  canHandle?: () => boolean;
  failOnce?: boolean;
}): { provider: TranscriptProvider; calls: () => number } {
  let calls = 0;
  let failed = false;
  const provider: TranscriptProvider = {
    id: "whisper-cpp",
    label: "Whisper",
    local: true,
    canHandle: opts?.canHandle ?? (() => true),
    async transcribe(): Promise<TranscriptResult> {
      calls++;
      if (opts?.failOnce && !failed) {
        failed = true;
        throw new Error("whisper crashed");
      }
      return {
        providerId: "whisper-cpp",
        language: "en",
        text: "whisper text",
        segments: [{ start: 0, end: 1, text: "whisper text" }],
        model: "small",
      };
    },
  };
  return { provider, calls: () => calls };
}

/** A provider that records the last ctx it saw and returns a canned result. */
function makeCapturingProvider() {
  let lastCtx: import("@sift/core").TranscriptContext | null = null;
  const provider: TranscriptProvider = {
    id: "cap",
    label: "cap",
    canHandle: () => true,
    transcribe: async (ctx) => {
      lastCtx = ctx;
      return { providerId: "cap", language: ctx.language, text: "x", segments: [], model: null };
    },
  };
  return { provider, ctx: () => lastCtx };
}

describe("TranscriptService", () => {
  it("get() creates a media row (download_status 'none'), transcribes via the resolved provider, and persists a transcript row", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const { provider, calls } = makeFakeProvider();
    const registry = new TranscriptRegistry();
    registry.register(provider);

    const service = new TranscriptService({
      db,
      registry,
      downloadsDir: () => tmpdir(),
      getPreferredLanguages: () => ["en"],
      getMethod: () => "auto",
    });
    const record = await service.get({ metadata });

    const media = getMediaBySourceUrl(db, metadata.sourceUrl);
    expect(media).toBeDefined();
    expect(media!.download_status).toBe("none");

    expect(record.providerId).toBe("fake");
    expect(record.mediaId).toBe(media!.id);
    expect(record.segments).toEqual([{ start: 0, end: 1, text: "hi" }]);

    const rows = getTranscriptsByMediaId(db, media!.id);
    expect(rows).toHaveLength(1);
    expect(calls()).toBe(1);

    db.close();
  });

  it("concurrent get() calls for the same video share one job (no duplicate transcript)", async () => {
    // The queue worker transcribing while the user clicks "Get transcript" — both non-force
    // calls overlap. Without in-flight dedup each passes the empty-existing check and inserts.
    const db = await openTestDatabase();
    runMigrations(db);
    const { provider, calls } = makeFakeProvider();
    const registry = new TranscriptRegistry();
    registry.register(provider);

    const service = new TranscriptService({
      db,
      registry,
      downloadsDir: () => tmpdir(),
      getPreferredLanguages: () => ["en"],
      getMethod: () => "auto",
    });
    const [a, b] = await Promise.all([service.get({ metadata }), service.get({ metadata })]);

    const media = getMediaBySourceUrl(db, metadata.sourceUrl);
    expect(getTranscriptsByMediaId(db, media!.id)).toHaveLength(1);
    expect(calls()).toBe(1);
    expect(a.id).toBe(b.id);

    db.close();
  });

  it("second get() call returns the same stored transcript without invoking the provider again", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const { provider, calls } = makeFakeProvider();
    const registry = new TranscriptRegistry();
    registry.register(provider);

    const service = new TranscriptService({
      db,
      registry,
      downloadsDir: () => tmpdir(),
      getPreferredLanguages: () => ["en"],
      getMethod: () => "auto",
    });
    const a = await service.get({ metadata });
    const b = await service.get({ metadata });

    expect(calls()).toBe(1);
    expect(b.id).toBe(a.id);
    expect(b.segments).toEqual([{ start: 0, end: 1, text: "hi" }]);

    const media = getMediaBySourceUrl(db, metadata.sourceUrl);
    const rows = getTranscriptsByMediaId(db, media!.id);
    expect(rows).toHaveLength(1);

    db.close();
  });

  it("rejects with a clear 'no captions' error when no provider resolves, but still leaves the media row", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const registry = new TranscriptRegistry();
    registry.register({
      id: "unhandled",
      label: "Unhandled",
      canHandle: () => false,
      async transcribe(): Promise<TranscriptResult> {
        throw new Error("should never be called");
      },
    });

    const service = new TranscriptService({
      db,
      registry,
      downloadsDir: () => tmpdir(),
      getPreferredLanguages: () => ["en"],
      getMethod: () => "auto",
    });

    await expect(service.get({ metadata })).rejects.toThrow(/no captions/i);

    const media = getMediaBySourceUrl(db, metadata.sourceUrl);
    expect(media).toBeDefined();
    expect(media!.download_status).toBe("none");

    const rows = getTranscriptsByMediaId(db, media!.id);
    expect(rows).toHaveLength(0);

    db.close();
  });

  it("picks the video's language when captions for it exist, else the preferred fallback", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    let seen: string | undefined;
    const registry = new TranscriptRegistry();
    registry.register({
      id: "fake",
      label: "Fake",
      canHandle: () => true,
      async transcribe(ctx) {
        seen = ctx.language;
        return { providerId: "fake", language: ctx.language, text: "t", segments: [], model: null };
      },
    });
    const service = new TranscriptService({
      db,
      registry,
      downloadsDir: () => tmpdir(),
      getPreferredLanguages: () => ["en", "pl"],
      getMethod: () => "auto",
    });
    await service.get({
      metadata: {
        sourceUrl: "https://x/1", platform: { id: "youtube", label: "YouTube", tier: "tested" },
        externalId: "1", title: "t", uploader: null, uploaderUrl: null, channelId: null, durationSec: null,
        thumbnailUrl: null, viewCount: null, likeCount: null, uploadDate: null,
        hasCaptions: true, language: "de", captionLanguages: ["de", "en"],
        formats: [], raw: {},
      },
    });
    expect(seen).toBe("de");
  });

  it("puts the resolved cookies file on the transcript context", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    let seen: string | null | undefined;
    const registry = new TranscriptRegistry();
    registry.register({
      id: "fake",
      label: "F",
      canHandle: () => true,
      async transcribe(ctx) {
        seen = ctx.cookiesFile;
        return { providerId: "fake", language: ctx.language, text: "t", segments: [], model: null };
      },
    });
    const service = new TranscriptService({
      db,
      registry,
      downloadsDir: () => tmpdir(),
      getPreferredLanguages: () => ["en"],
      getMethod: () => "auto",
      getCookiesFile: async () => "/c/youtube.txt",
    });
    await service.get({
      metadata: {
        sourceUrl: "https://www.youtube.com/watch?v=abc123",
        platform: { id: "youtube", label: "YouTube", tier: "tested" },
        externalId: "abc123", title: "t", uploader: null, uploaderUrl: null, channelId: null, durationSec: null,
        thumbnailUrl: null, viewCount: null, likeCount: null, uploadDate: null,
        hasCaptions: true, language: null, captionLanguages: ["en"],
        formats: [], raw: {},
      },
    });
    expect(seen).toBe("/c/youtube.txt");

    db.close();
  });

  it("passes the done download's file_path as ctx.audioPath", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl, platform_id: "youtube", external_id: "abc123",
      title: "Vid", uploader: "Chan", uploader_url: null, duration_s: 120,
      thumbnail_path: null, view_count: null, like_count: null, published_at: null,
      metadata_json: "{}", download_status: "done",
    });
    insertDownload(db, {
      media_id: media.id, format_id: "137", label: "1080p", ext: "mp4", height: 1080,
      file_path: "/downloads/video.mp4", file_size: 10, status: "done", error: null,
    });

    const registry = new TranscriptRegistry();
    const { provider, ctx } = makeCapturingProvider();
    registry.register(provider);
    const svc = new TranscriptService({
      db, registry, downloadsDir: () => tmpdir(), getPreferredLanguages: () => ["en"], getMethod: () => "auto",
    });
    await svc.get({ metadata: { ...metadata, hasCaptions: false } });
    expect(ctx()?.audioPath).toBe("/downloads/video.mp4");

    db.close();
  });

  it("passes null audioPath when there is no done download", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const registry = new TranscriptRegistry();
    const { provider, ctx } = makeCapturingProvider();
    registry.register(provider);
    const svc = new TranscriptService({
      db, registry, downloadsDir: () => tmpdir(), getPreferredLanguages: () => ["en"], getMethod: () => "auto",
    });
    await svc.get({ metadata: { ...metadata, hasCaptions: false } });
    expect(ctx()?.audioPath).toBeNull();

    db.close();
  });

  it("get() forwards progress from the provider to the supplied onProgress", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const registry = new TranscriptRegistry();
    registry.register({
      id: "fake",
      label: "Fake",
      canHandle: () => true,
      async transcribe(ctx, onProgress) {
        onProgress({ stage: "transcribing", ratio: null });
        return { providerId: "fake", language: ctx.language, text: "t", segments: [], model: null };
      },
    });
    const service = new TranscriptService({
      db,
      registry,
      downloadsDir: () => tmpdir(),
      getPreferredLanguages: () => ["en"],
      getMethod: () => "auto",
    });

    const seen: string[] = [];
    await service.get({ metadata }, (p) => seen.push(p.stage));
    expect(seen).toContain("transcribing");

    db.close();
  });

  it("uses the configured method to resolve the provider (captions_only skips whisper)", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const { provider: localProvider, calls } = makeFakeLocalProvider();
    const registry = new TranscriptRegistry();
    registry.register(localProvider);

    const service = new TranscriptService({
      db,
      registry,
      downloadsDir: () => tmpdir(),
      getPreferredLanguages: () => ["en"],
      getMethod: () => "captions_only",
    });

    // No captions-capable (non-local) provider is registered, so captions_only must
    // reject even though the local (whisper) provider could handle it.
    await expect(service.get({ metadata: { ...metadata, hasCaptions: false } })).rejects.toThrow(
      /no captions/i,
    );
    expect(calls()).toBe(0);

    db.close();
  });

  it("without force, returns the cached transcript and does not invoke the provider", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl, platform_id: "youtube", external_id: "abc123",
      title: "Vid", uploader: "Chan", uploader_url: null, duration_s: 120,
      thumbnail_path: null, view_count: null, like_count: null, published_at: null,
      metadata_json: "{}", download_status: "none",
    });
    const existingRow = insertTranscript(db, {
      media_id: media.id, provider_id: "ytdlp-subs", language: "en",
      text: "cached text", segments_json: "[]", model: null,
    });

    const { provider, calls } = makeFakeProvider();
    const registry = new TranscriptRegistry();
    registry.register(provider);
    const service = new TranscriptService({
      db,
      registry,
      downloadsDir: () => tmpdir(),
      getPreferredLanguages: () => ["en"],
      getMethod: () => "auto",
    });

    const record = await service.get({ metadata });
    expect(record.id).toBe(existingRow.id);
    expect(record.text).toBe("cached text");
    expect(calls()).toBe(0);

    db.close();
  });

  it("force:'whisper' bypasses the cache, uses the local provider, and replaces the old transcript", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl, platform_id: "youtube", external_id: "abc123",
      title: "Vid", uploader: "Chan", uploader_url: null, duration_s: 120,
      thumbnail_path: null, view_count: null, like_count: null, published_at: null,
      metadata_json: "{}", download_status: "none",
    });
    const oldRow = insertTranscript(db, {
      media_id: media.id, provider_id: "ytdlp-subs", language: "en",
      text: "old captions text", segments_json: "[]", model: null,
    });

    const { provider: captionsProvider, calls: captionsCalls } = makeFakeProvider();
    const { provider: localProvider, calls: localCalls } = makeFakeLocalProvider();
    const registry = new TranscriptRegistry();
    registry.register(captionsProvider);
    registry.register(localProvider);
    const service = new TranscriptService({
      db,
      registry,
      downloadsDir: () => tmpdir(),
      getPreferredLanguages: () => ["en"],
      getMethod: () => "auto",
    });

    const record = await service.get({ metadata, force: "whisper" });

    expect(localCalls()).toBe(1);
    expect(captionsCalls()).toBe(0);
    expect(record.providerId).toBe("whisper-cpp");
    expect(record.text).toBe("whisper text");

    const rows = getTranscriptsByMediaId(db, media.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).not.toBe(oldRow.id);
    expect(rows.find((r) => r.id === oldRow.id)).toBeUndefined();

    db.close();
  });

  it("a FAILED force:'whisper' re-transcribe leaves the existing transcript intact", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl, platform_id: "youtube", external_id: "abc123",
      title: "Vid", uploader: "Chan", uploader_url: null, duration_s: 120,
      thumbnail_path: null, view_count: null, like_count: null, published_at: null,
      metadata_json: "{}", download_status: "none",
    });
    const oldRow = insertTranscript(db, {
      media_id: media.id, provider_id: "ytdlp-subs", language: "en",
      text: "old captions text", segments_json: "[]", model: null,
    });

    const { provider: localProvider } = makeFakeLocalProvider({ failOnce: true });
    const registry = new TranscriptRegistry();
    registry.register(localProvider);
    const service = new TranscriptService({
      db,
      registry,
      downloadsDir: () => tmpdir(),
      getPreferredLanguages: () => ["en"],
      getMethod: () => "auto",
    });

    await expect(service.get({ metadata, force: "whisper" })).rejects.toThrow(/whisper crashed/);

    const rows = getTranscriptsByMediaId(db, media.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(oldRow.id);
    expect(rows[0]!.text).toBe("old captions text");

    db.close();
  });

  it("force:'whisper' with no local provider able to handle it rejects with a clear error, never falls back to captions, and leaves the existing transcript intact", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl, platform_id: "youtube", external_id: "abc123",
      title: "Vid", uploader: "Chan", uploader_url: null, duration_s: 120,
      thumbnail_path: null, view_count: null, like_count: null, published_at: null,
      metadata_json: "{}", download_status: "none",
    });
    const oldRow = insertTranscript(db, {
      media_id: media.id, provider_id: "ytdlp-subs", language: "en",
      text: "old captions text", segments_json: "[]", model: null,
    });

    // Whisper is registered but can't handle this video (e.g. not installed / not
    // downloaded); a captions provider IS registered and could easily serve the
    // request via "prefer_whisper"'s fallback — the strict force path must not take it.
    const { provider: localProvider, calls: localCalls } = makeFakeLocalProvider({
      canHandle: () => false,
    });
    const { provider: captionsProvider, calls: captionsCalls } = makeFakeProvider();
    const registry = new TranscriptRegistry();
    registry.register(localProvider);
    registry.register(captionsProvider);
    const service = new TranscriptService({
      db,
      registry,
      downloadsDir: () => tmpdir(),
      getPreferredLanguages: () => ["en"],
      getMethod: () => "auto",
    });

    await expect(service.get({ metadata, force: "whisper" })).rejects.toThrow(
      /whisper can't transcribe/i,
    );
    expect(localCalls()).toBe(0);
    expect(captionsCalls()).toBe(0);

    const rows = getTranscriptsByMediaId(db, media.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(oldRow.id);
    expect(rows[0]!.text).toBe("old captions text");

    db.close();
  });
});
