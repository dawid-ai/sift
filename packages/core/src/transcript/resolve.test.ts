import { expect, it } from "vitest";
import { resolveTranscriptProvider } from "./resolve";
import type { TranscriptContext, TranscriptProvider } from "./types";

const ctx = (over: Partial<TranscriptContext> = {}): TranscriptContext => ({
  sourceUrl: "u",
  hasCaptions: true,
  language: "en",
  captionLanguages: ["en"],
  audioPath: null,
  ...over,
});
const captions = (can: boolean): TranscriptProvider => ({
  id: "ytdlp-subs",
  label: "c",
  canHandle: () => can,
  transcribe: async () => ({
    providerId: "ytdlp-subs",
    language: "en",
    text: "",
    segments: [],
    model: null,
  }),
});
const whisper = (can: boolean): TranscriptProvider => ({
  id: "whisper-cpp",
  label: "w",
  local: true,
  canHandle: () => can,
  transcribe: async () => ({
    providerId: "whisper-cpp",
    language: "en",
    text: "",
    segments: [],
    model: "small",
  }),
});

it("auto: first canHandle wins (captions before whisper)", () => {
  expect(
    resolveTranscriptProvider([captions(true), whisper(true)], ctx(), "auto")
      ?.id,
  ).toBe("ytdlp-subs");
});
it("prefer_whisper: whisper wins when it canHandle", () => {
  expect(
    resolveTranscriptProvider(
      [captions(true), whisper(true)],
      ctx({ audioPath: "/x" }),
      "prefer_whisper",
    )?.id,
  ).toBe("whisper-cpp");
});
it("prefer_whisper: falls back to captions when whisper can't handle (not downloaded)", () => {
  expect(
    resolveTranscriptProvider(
      [captions(true), whisper(false)],
      ctx(),
      "prefer_whisper",
    )?.id,
  ).toBe("ytdlp-subs");
});
it("captions_only: never returns the local provider", () => {
  expect(
    resolveTranscriptProvider(
      [captions(false), whisper(true)],
      ctx({ audioPath: "/x" }),
      "captions_only",
    ),
  ).toBeNull();
});
it("captions_only: returns captions when available", () => {
  expect(
    resolveTranscriptProvider(
      [captions(true), whisper(true)],
      ctx(),
      "captions_only",
    )?.id,
  ).toBe("ytdlp-subs");
});
