import { describe, expect, it } from "vitest";
import { baseLangCode, pickTranscriptLanguage } from "./language";

describe("baseLangCode", () => {
  it("lowercases and strips region/translation suffix", () => {
    expect(baseLangCode("en-US")).toBe("en");
    expect(baseLangCode("EN")).toBe("en");
    expect(baseLangCode("pt-BR")).toBe("pt");
    expect(baseLangCode("")).toBe("");
  });
});

describe("pickTranscriptLanguage", () => {
  const P = ["en", "pl"];
  it("uses the detected language when captions for it exist", () => {
    expect(
      pickTranscriptLanguage({
        videoLanguage: "de",
        available: ["de", "en"],
        preferred: P,
      }),
    ).toBe("de");
  });
  it("detected wins even when it is not in the preferred list", () => {
    expect(
      pickTranscriptLanguage({
        videoLanguage: "fr",
        available: ["fr"],
        preferred: P,
      }),
    ).toBe("fr");
  });
  it("falls back through preferred order when the detected track is missing", () => {
    expect(
      pickTranscriptLanguage({
        videoLanguage: "de",
        available: ["en", "pl"],
        preferred: P,
      }),
    ).toBe("en");
    expect(
      pickTranscriptLanguage({
        videoLanguage: "de",
        available: ["pl"],
        preferred: P,
      }),
    ).toBe("pl");
  });
  it("uses preferred order when the language is unknown", () => {
    expect(
      pickTranscriptLanguage({
        videoLanguage: null,
        available: ["pl", "en"],
        preferred: P,
      }),
    ).toBe("en");
  });
  it("best-effort returns the top candidate when nothing matches available", () => {
    expect(
      pickTranscriptLanguage({
        videoLanguage: "de",
        available: ["es"],
        preferred: P,
      }),
    ).toBe("de");
    expect(
      pickTranscriptLanguage({
        videoLanguage: null,
        available: ["es"],
        preferred: P,
      }),
    ).toBe("en");
  });
  it("normalizes and dedups candidates and available", () => {
    expect(
      pickTranscriptLanguage({
        videoLanguage: "EN-US",
        available: ["en-GB"],
        preferred: ["en"],
      }),
    ).toBe("en");
  });
  it("empty candidates → en", () => {
    expect(
      pickTranscriptLanguage({
        videoLanguage: null,
        available: [],
        preferred: [],
      }),
    ).toBe("en");
  });
});
