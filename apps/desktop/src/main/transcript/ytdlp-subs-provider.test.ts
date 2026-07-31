import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createYtdlpSubsProvider } from "./ytdlp-subs-provider";
import type { YtDlpRunner } from "../sidecars/ytdlp";

function runnerWith(vtt: string | null): YtDlpRunner {
  return {
    dumpJson: async () => ({}),
    flatPlaylist: async () => ({}),
    listExtractors: async () => [],
    download: async () => ({ filePath: "" }),
    fetchSubtitles: async (opts) => {
      if (vtt === null) return null;
      const p = join(opts.outputDir, "subs.en.vtt");
      writeFileSync(p, vtt);
      return { subPath: p, format: "vtt" };
    },
  };
}

function runnerWithJson3(raw: string): YtDlpRunner {
  return {
    dumpJson: async () => ({}),
    flatPlaylist: async () => ({}),
    listExtractors: async () => [],
    download: async () => ({ filePath: "" }),
    fetchSubtitles: async (opts) => {
      const p = join(opts.outputDir, "subs.en.json3");
      writeFileSync(p, raw);
      return { subPath: p, format: "json3" };
    },
  };
}
const ctx = {
  sourceUrl: "https://y/x",
  hasCaptions: true,
  language: "en",
  captionLanguages: [] as string[],
  audioPath: null,
};

function makeCtx(over: Partial<import("@sift/core").TranscriptContext> = {}) {
  return {
    sourceUrl: "u",
    hasCaptions: true,
    language: "en",
    captionLanguages: [],
    audioPath: null,
    ...over,
  } as import("@sift/core").TranscriptContext;
}

describe("ytdlp-subs provider", () => {
  it("canHandle mirrors ctx.hasCaptions", () => {
    const p = createYtdlpSubsProvider({ runner: runnerWith(null) });
    expect(p.canHandle(ctx)).toBe(true);
    expect(p.canHandle({ ...ctx, hasCaptions: false })).toBe(false);
  });
  it("canHandle: false when there are no captions", () => {
    const p = createYtdlpSubsProvider({ runner: runnerWith(null) });
    expect(p.canHandle(makeCtx({ hasCaptions: false }))).toBe(false);
  });
  it("canHandle: true when caption list is unknown (empty) and hasCaptions", () => {
    const p = createYtdlpSubsProvider({ runner: runnerWith(null) });
    expect(p.canHandle(makeCtx({ captionLanguages: [] }))).toBe(true);
  });
  it("canHandle: true when the resolved language is in the caption list", () => {
    const p = createYtdlpSubsProvider({ runner: runnerWith(null) });
    expect(p.canHandle(makeCtx({ language: "en", captionLanguages: ["es", "en-US"] }))).toBe(true);
  });
  it("canHandle: false when the resolved language is NOT in a known caption list", () => {
    const p = createYtdlpSubsProvider({ runner: runnerWith(null) });
    expect(p.canHandle(makeCtx({ language: "en", captionLanguages: ["es", "fr"] }))).toBe(false);
  });
  it("transcribes fetched subs into a TranscriptResult (vtt format)", async () => {
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello there\n";
    const p = createYtdlpSubsProvider({ runner: runnerWith(vtt) });
    const res = await p.transcribe(ctx, () => {});
    expect(res.providerId).toBe("ytdlp-subs");
    expect(res.segments).toEqual([{ start: 1, end: 3, text: "Hello there" }]);
    expect(res.text).toBe("Hello there");
    expect(res.model).toBeNull();
  });
  it("dispatches to parseJson3 when the runner reports json3 format", async () => {
    const raw = JSON.stringify({
      events: [{ tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "Hello there" }] }],
    });
    const p = createYtdlpSubsProvider({ runner: runnerWithJson3(raw) });
    const res = await p.transcribe(ctx, () => {});
    expect(res.providerId).toBe("ytdlp-subs");
    expect(res.segments).toEqual([{ start: 1, end: 3, text: "Hello there" }]);
    expect(res.text).toBe("Hello there");
    expect(res.model).toBeNull();
  });
  it("throws a clear error when no captions come back", async () => {
    const p = createYtdlpSubsProvider({ runner: runnerWith(null) });
    await expect(p.transcribe(ctx, () => {})).rejects.toThrow(/no en captions/i);
  });
});
