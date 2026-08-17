import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { openTestDatabase } from "@sift/db/testing";
import {
  createPrompt,
  getMediaBySourceUrl,
  getSummariesByMediaId,
  insertMedia,
  insertSummary,
  insertTranscript,
  listPrompts,
  runMigrations,
} from "@sift/db";
import type { MediaMetadata } from "@sift/ipc-contract";
import { AiRegistry, assembleSummaryContent } from "@sift/core";
import type { AiProvider, SummarizeInput } from "@sift/core";
import { SummarizeService } from "./summarize-service";

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

/** A fake provider that emits two token deltas, resolves "FULL SUMMARY", and records the input it was called with. */
function makeFakeProvider(): {
  provider: AiProvider;
  lastInput: () => SummarizeInput | null;
} {
  let lastInput: SummarizeInput | null = null;
  const provider: AiProvider = {
    id: "anthropic",
    label: "Fake Anthropic",
    needsKey: true,
    models: () => [{ id: "claude-opus-4-8", label: "Claude Opus 4.8" }],
    async summarize(input, onToken) {
      lastInput = input;
      onToken("Full ");
      onToken("summary chunk.");
      return "FULL SUMMARY";
    },
  };
  return { provider, lastInput: () => lastInput };
}

describe("SummarizeService", () => {
  it("start() streams tokens, persists a summary row, and returns a SummaryRecord", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl,
      platform_id: metadata.platform.id,
      external_id: metadata.externalId,
      title: metadata.title,
      uploader: metadata.uploader,
      uploader_url: metadata.uploaderUrl,
      duration_s: metadata.durationSec,
      thumbnail_path: metadata.thumbnailUrl,
      view_count: metadata.viewCount,
      like_count: metadata.likeCount,
      published_at: null,
      metadata_json: JSON.stringify(metadata.raw),
      download_status: "none",
    });
    insertTranscript(db, {
      media_id: media.id,
      provider_id: "fake",
      language: "en",
      text: "this is the transcript text",
      segments_json: "[]",
      model: null,
    });
    const prompts = listPrompts(db);
    const prompt = prompts[0]!;

    const { provider, lastInput } = makeFakeProvider();
    const registry = new AiRegistry();
    registry.register(provider);

    const deltas: string[] = [];
    const downloadsDir = mkdtempSync(join(tmpdir(), "sift-summarize-test-"));
    const service = new SummarizeService({
      db,
      registry,
      downloadsDir: () => downloadsDir,
    });

    const record = await service.start(
      {
        metadata,
        providerId: "anthropic",
        model: "claude-opus-4-8",
        promptId: prompt.id,
      },
      (delta) => deltas.push(delta),
    );

    expect(deltas).toEqual(["Full ", "summary chunk."]);
    expect(record.text).toBe("FULL SUMMARY");
    expect(record.providerId).toBe("anthropic");
    expect(record.model).toBe("claude-opus-4-8");
    expect(record.mediaId).toBe(media.id);
    expect(record.promptId).toBe(prompt.id);

    const rows = getSummariesByMediaId(db, media.id);
    expect(rows).toHaveLength(1);

    expect(lastInput()?.content).toBe(
      assembleSummaryContent(prompt.body, "this is the transcript text"),
    );

    db.close();
  });

  it("throws 'Get a transcript first.' when no transcript exists for the URL (media auto-created)", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const prompts = listPrompts(db);
    const prompt = prompts[0]!;

    const { provider } = makeFakeProvider();
    const registry = new AiRegistry();
    registry.register(provider);

    const downloadsDir = mkdtempSync(join(tmpdir(), "sift-summarize-test-"));
    const service = new SummarizeService({
      db,
      registry,
      downloadsDir: () => downloadsDir,
    });

    await expect(
      service.start({
        metadata,
        providerId: "anthropic",
        model: "claude-opus-4-8",
        promptId: prompt.id,
      }),
    ).rejects.toThrow(/get a transcript first/i);

    const media = getMediaBySourceUrl(db, metadata.sourceUrl);
    expect(media).toBeDefined();

    db.close();
  });

  it("throws when providerId is unregistered", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl,
      platform_id: metadata.platform.id,
      external_id: metadata.externalId,
      title: metadata.title,
      uploader: metadata.uploader,
      uploader_url: metadata.uploaderUrl,
      duration_s: metadata.durationSec,
      thumbnail_path: metadata.thumbnailUrl,
      view_count: metadata.viewCount,
      like_count: metadata.likeCount,
      published_at: null,
      metadata_json: JSON.stringify(metadata.raw),
      download_status: "none",
    });
    insertTranscript(db, {
      media_id: media.id,
      provider_id: "fake",
      language: "en",
      text: "transcript text",
      segments_json: "[]",
      model: null,
    });
    const prompts = listPrompts(db);
    const prompt = prompts[0]!;

    const registry = new AiRegistry();
    const downloadsDir = mkdtempSync(join(tmpdir(), "sift-summarize-test-"));
    const service = new SummarizeService({
      db,
      registry,
      downloadsDir: () => downloadsDir,
    });

    await expect(
      service.start({
        metadata,
        providerId: "anthropic",
        model: "claude-opus-4-8",
        promptId: prompt.id,
      }),
    ).rejects.toThrow(/unknown ai provider/i);

    db.close();
  });

  it("export() writes the summary text to a .md file under downloadsDir and returns its path", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl,
      platform_id: metadata.platform.id,
      external_id: metadata.externalId,
      title: metadata.title,
      uploader: metadata.uploader,
      uploader_url: metadata.uploaderUrl,
      duration_s: metadata.durationSec,
      thumbnail_path: metadata.thumbnailUrl,
      view_count: metadata.viewCount,
      like_count: metadata.likeCount,
      published_at: null,
      metadata_json: JSON.stringify(metadata.raw),
      download_status: "none",
    });
    const prompts = listPrompts(db);
    const prompt = prompts[0]!;
    const summary = insertSummary(db, {
      media_id: media.id,
      prompt_id: prompt.id,
      provider_id: "anthropic",
      model: "claude-opus-4-8",
      text: "This is the exported summary text.",
    });

    const registry = new AiRegistry();
    const downloadsDir = mkdtempSync(join(tmpdir(), "sift-summarize-test-"));
    const service = new SummarizeService({
      db,
      registry,
      downloadsDir: () => downloadsDir,
    });

    const path = await service.export(summary.id);

    expect(path.endsWith(".md")).toBe(true);
    expect(path.startsWith(downloadsDir)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(
      "This is the exported summary text.",
    );

    db.close();
  });

  it("export() puts the prompt name in the filename", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl,
      platform_id: metadata.platform.id,
      external_id: metadata.externalId,
      title: metadata.title,
      uploader: metadata.uploader,
      uploader_url: metadata.uploaderUrl,
      duration_s: metadata.durationSec,
      thumbnail_path: metadata.thumbnailUrl,
      view_count: metadata.viewCount,
      like_count: metadata.likeCount,
      published_at: null,
      metadata_json: JSON.stringify(metadata.raw),
      download_status: "none",
    });
    const prompt = createPrompt(db, {
      name: "Key Points",
      body: "Summarize: {{transcript}}",
    });
    const summary = insertSummary(db, {
      media_id: media.id,
      prompt_id: prompt.id,
      provider_id: "anthropic",
      model: "claude-haiku-4-5",
      text: "the summary body",
    });

    const registry = new AiRegistry();
    const downloadsDir = mkdtempSync(join(tmpdir(), "sift-summarize-test-"));
    const service = new SummarizeService({
      db,
      registry,
      downloadsDir: () => downloadsDir,
    });

    const outPath = await service.export(summary.id);

    expect(basename(outPath)).toContain("Key Points"); // sanitizeFilename preserves spaces (collapses whitespace only)
    expect(basename(outPath)).toMatch(/\.md$/);

    db.close();
  });

  it("export() falls back to '__summary' in the filename when the summary has no prompt", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl,
      platform_id: metadata.platform.id,
      external_id: metadata.externalId,
      title: metadata.title,
      uploader: metadata.uploader,
      uploader_url: metadata.uploaderUrl,
      duration_s: metadata.durationSec,
      thumbnail_path: metadata.thumbnailUrl,
      view_count: metadata.viewCount,
      like_count: metadata.likeCount,
      published_at: null,
      metadata_json: JSON.stringify(metadata.raw),
      download_status: "none",
    });
    const summary = insertSummary(db, {
      media_id: media.id,
      prompt_id: null,
      provider_id: "anthropic",
      model: "claude-opus-4-8",
      text: "This is the exported summary text.",
    });

    const registry = new AiRegistry();
    const downloadsDir = mkdtempSync(join(tmpdir(), "sift-summarize-test-"));
    const service = new SummarizeService({
      db,
      registry,
      downloadsDir: () => downloadsDir,
    });

    const outPath = await service.export(summary.id);

    expect(basename(outPath)).toMatch(/__summary\.md$/);
    expect(basename(outPath)).not.toContain("Key Points");

    db.close();
  });

  it("passes a timestamped transcript when the prompt opts in", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl,
      platform_id: metadata.platform.id,
      external_id: metadata.externalId,
      title: metadata.title,
      uploader: metadata.uploader,
      uploader_url: metadata.uploaderUrl,
      duration_s: metadata.durationSec,
      thumbnail_path: metadata.thumbnailUrl,
      view_count: metadata.viewCount,
      like_count: metadata.likeCount,
      published_at: null,
      metadata_json: JSON.stringify(metadata.raw),
      download_status: "none",
    });
    const prompt = createPrompt(db, {
      name: "Chapters",
      body: "List chapters. {{TIMESTAMPS}}",
    });
    insertTranscript(db, {
      media_id: media.id,
      provider_id: "whisper",
      language: "en",
      text: "one two",
      segments_json: JSON.stringify([
        { start: 0, end: 3, text: "one" },
        { start: 65, end: 70, text: "two" },
      ]),
      model: "ggml-small",
    });

    const { provider, lastInput } = makeFakeProvider();
    const registry = new AiRegistry();
    registry.register(provider);
    const downloadsDir = mkdtempSync(join(tmpdir(), "sift-summarize-test-"));
    const service = new SummarizeService({
      db,
      registry,
      downloadsDir: () => downloadsDir,
    });

    await service.start({
      metadata,
      providerId: "anthropic",
      model: "m",
      promptId: prompt.id,
    });

    expect(lastInput()?.content).toContain("[00:00] one");
    expect(lastInput()?.content).toContain("[01:05] two");
    expect(lastInput()?.content).not.toContain("{{TIMESTAMPS}}");

    db.close();
  });

  it("leaves a prompt without the marker on flat text", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl,
      platform_id: metadata.platform.id,
      external_id: metadata.externalId,
      title: metadata.title,
      uploader: metadata.uploader,
      uploader_url: metadata.uploaderUrl,
      duration_s: metadata.durationSec,
      thumbnail_path: metadata.thumbnailUrl,
      view_count: metadata.viewCount,
      like_count: metadata.likeCount,
      published_at: null,
      metadata_json: JSON.stringify(metadata.raw),
      download_status: "none",
    });
    const prompt = createPrompt(db, { name: "Plain", body: "Summarize." });
    insertTranscript(db, {
      media_id: media.id,
      provider_id: "whisper",
      language: "en",
      text: "one two",
      segments_json: JSON.stringify([{ start: 0, end: 3, text: "one" }]),
      model: null,
    });

    const { provider, lastInput } = makeFakeProvider();
    const registry = new AiRegistry();
    registry.register(provider);
    const downloadsDir = mkdtempSync(join(tmpdir(), "sift-summarize-test-"));
    const service = new SummarizeService({
      db,
      registry,
      downloadsDir: () => downloadsDir,
    });

    await service.start({
      metadata,
      providerId: "anthropic",
      model: "m",
      promptId: prompt.id,
    });

    expect(lastInput()?.content).toContain("----- TRANSCRIPT -----\none two");
    expect(lastInput()?.content).not.toContain("[00:00]");

    db.close();
  });

  it("degrades to flat text when segments_json is invalid JSON syntax", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl,
      platform_id: metadata.platform.id,
      external_id: metadata.externalId,
      title: metadata.title,
      uploader: metadata.uploader,
      uploader_url: metadata.uploaderUrl,
      duration_s: metadata.durationSec,
      thumbnail_path: metadata.thumbnailUrl,
      view_count: metadata.viewCount,
      like_count: metadata.likeCount,
      published_at: null,
      metadata_json: JSON.stringify(metadata.raw),
      download_status: "none",
    });
    const prompt = createPrompt(db, {
      name: "Chapters",
      body: "List chapters. {{TIMESTAMPS}}",
    });
    insertTranscript(db, {
      media_id: media.id,
      provider_id: "whisper",
      language: "en",
      text: "one two",
      segments_json: "{not valid json",
      model: "ggml-small",
    });

    const { provider, lastInput } = makeFakeProvider();
    const registry = new AiRegistry();
    registry.register(provider);
    const downloadsDir = mkdtempSync(join(tmpdir(), "sift-summarize-test-"));
    const service = new SummarizeService({
      db,
      registry,
      downloadsDir: () => downloadsDir,
    });

    await expect(
      service.start({
        metadata,
        providerId: "anthropic",
        model: "m",
        promptId: prompt.id,
      }),
    ).resolves.toBeDefined();

    expect(lastInput()?.content).toContain("----- TRANSCRIPT -----\none two");
    expect(lastInput()?.content).not.toContain("[00:00]");

    db.close();
  });

  it("degrades to flat text when segments_json is valid JSON but not an array", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl,
      platform_id: metadata.platform.id,
      external_id: metadata.externalId,
      title: metadata.title,
      uploader: metadata.uploader,
      uploader_url: metadata.uploaderUrl,
      duration_s: metadata.durationSec,
      thumbnail_path: metadata.thumbnailUrl,
      view_count: metadata.viewCount,
      like_count: metadata.likeCount,
      published_at: null,
      metadata_json: JSON.stringify(metadata.raw),
      download_status: "none",
    });
    const prompt = createPrompt(db, {
      name: "Chapters",
      body: "List chapters. {{TIMESTAMPS}}",
    });
    insertTranscript(db, {
      media_id: media.id,
      provider_id: "whisper",
      language: "en",
      text: "one two",
      segments_json: JSON.stringify({ start: 0, text: "not an array" }),
      model: "ggml-small",
    });

    const { provider, lastInput } = makeFakeProvider();
    const registry = new AiRegistry();
    registry.register(provider);
    const downloadsDir = mkdtempSync(join(tmpdir(), "sift-summarize-test-"));
    const service = new SummarizeService({
      db,
      registry,
      downloadsDir: () => downloadsDir,
    });

    await expect(
      service.start({
        metadata,
        providerId: "anthropic",
        model: "m",
        promptId: prompt.id,
      }),
    ).resolves.toBeDefined();

    expect(lastInput()?.content).toContain("----- TRANSCRIPT -----\none two");
    expect(lastInput()?.content).not.toContain("[00:00]");

    db.close();
  });

  it("degrades to flat text when segments_json is an array of wrong-shaped elements", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl,
      platform_id: metadata.platform.id,
      external_id: metadata.externalId,
      title: metadata.title,
      uploader: metadata.uploader,
      uploader_url: metadata.uploaderUrl,
      duration_s: metadata.durationSec,
      thumbnail_path: metadata.thumbnailUrl,
      view_count: metadata.viewCount,
      like_count: metadata.likeCount,
      published_at: null,
      metadata_json: JSON.stringify(metadata.raw),
      download_status: "none",
    });
    const prompt = createPrompt(db, {
      name: "Chapters",
      body: "List chapters. {{TIMESTAMPS}}",
    });
    insertTranscript(db, {
      media_id: media.id,
      provider_id: "whisper",
      language: "en",
      text: "one two",
      segments_json: JSON.stringify([1, 2, 3]),
      model: "ggml-small",
    });

    const { provider, lastInput } = makeFakeProvider();
    const registry = new AiRegistry();
    registry.register(provider);
    const downloadsDir = mkdtempSync(join(tmpdir(), "sift-summarize-test-"));
    const service = new SummarizeService({
      db,
      registry,
      downloadsDir: () => downloadsDir,
    });

    await expect(
      service.start({
        metadata,
        providerId: "anthropic",
        model: "m",
        promptId: prompt.id,
      }),
    ).resolves.toBeDefined();

    expect(lastInput()?.content).toContain("----- TRANSCRIPT -----\none two");
    expect(lastInput()?.content).not.toContain("[00:00]");

    db.close();
  });

  it("drops only the wrong-shaped elements from a mixed segments_json array", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const media = insertMedia(db, {
      source_url: metadata.sourceUrl,
      platform_id: metadata.platform.id,
      external_id: metadata.externalId,
      title: metadata.title,
      uploader: metadata.uploader,
      uploader_url: metadata.uploaderUrl,
      duration_s: metadata.durationSec,
      thumbnail_path: metadata.thumbnailUrl,
      view_count: metadata.viewCount,
      like_count: metadata.likeCount,
      published_at: null,
      metadata_json: JSON.stringify(metadata.raw),
      download_status: "none",
    });
    const prompt = createPrompt(db, {
      name: "Chapters",
      body: "List chapters. {{TIMESTAMPS}}",
    });
    insertTranscript(db, {
      media_id: media.id,
      provider_id: "whisper",
      language: "en",
      text: "one two",
      segments_json: JSON.stringify([
        { start: 0, end: 3, text: "one" },
        { foo: "bar" },
      ]),
      model: "ggml-small",
    });

    const { provider, lastInput } = makeFakeProvider();
    const registry = new AiRegistry();
    registry.register(provider);
    const downloadsDir = mkdtempSync(join(tmpdir(), "sift-summarize-test-"));
    const service = new SummarizeService({
      db,
      registry,
      downloadsDir: () => downloadsDir,
    });

    await expect(
      service.start({
        metadata,
        providerId: "anthropic",
        model: "m",
        promptId: prompt.id,
      }),
    ).resolves.toBeDefined();

    expect(lastInput()?.content).toContain("[00:00] one");

    db.close();
  });
});
