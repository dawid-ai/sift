import { expect, it } from "vitest";
import {
  createWhisperConfigStore,
  DEFAULT_WHISPER_CONFIG,
  isOcrLanguage,
  isWhisperLanguage,
} from "./whisper-config";

const KNOWN = new Set(["ggml-small.bin", "ggml-large-v3-turbo.bin"]);

function memFs(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  return {
    fs: {
      existsSync: (p: string) => files.has(p),
      readFileSync: (p: string) => Buffer.from(files.get(p) ?? ""),
      writeFileSync: (p: string, d: Buffer) =>
        void files.set(p, d.toString("utf8")),
      rmSync: (p: string) => void files.delete(p),
      mkdirSync: () => {},
    },
  };
}

const store = (initial?: Record<string, string>) =>
  createWhisperConfigStore({
    filePath: "w.json",
    isKnownModel: (n) => KNOWN.has(n),
    ...memFs(initial),
  });

it("defaults to the shipped model, auto language, and English OCR", () => {
  expect(store().get()).toEqual(DEFAULT_WHISPER_CONFIG);
});

it("round-trips a valid config", () => {
  const s = store();
  const saved = s.set({
    modelName: "ggml-large-v3-turbo.bin",
    language: "pl",
    ocrLanguage: "eng+deu",
  });
  expect(saved.language).toBe("pl");
  expect(s.get()).toEqual(saved);
});

it("rejects a model name that is not in the catalog", () => {
  // A name reaching the store unchecked becomes a filename under the models directory.
  expect(
    store().set({
      modelName: "../../../etc/passwd",
      language: "auto",
      ocrLanguage: "eng",
    }).modelName,
  ).toBe("ggml-small.bin");
});

it("validates language codes, which reach argv and a filename", () => {
  expect(isWhisperLanguage("auto")).toBe(true);
  expect(isWhisperLanguage("en")).toBe(true);
  expect(isWhisperLanguage("pt-br")).toBe(true);
  expect(isWhisperLanguage("--flag")).toBe(false);
  expect(isWhisperLanguage("en; rm -rf")).toBe(false);

  expect(isOcrLanguage("eng")).toBe(true);
  expect(isOcrLanguage("eng+deu")).toBe(true);
  expect(isOcrLanguage("chi_sim")).toBe(true);
  expect(isOcrLanguage("../eng")).toBe(false);
  expect(isOcrLanguage("eng/../..")).toBe(false);
  expect(isOcrLanguage("")).toBe(false);
});

it("lowercases a language code", () => {
  expect(
    store().set({
      modelName: "ggml-small.bin",
      language: "PL",
      ocrLanguage: "eng",
    }).language,
  ).toBe("pl");
});

it("falls back per field, not whole-file, on a bad value", () => {
  expect(
    store({
      "w.json": JSON.stringify({
        modelName: "ggml-large-v3-turbo.bin",
        language: "nonsense-code",
        ocrLanguage: "eng+fra",
      }),
    }).get(),
  ).toEqual({
    modelName: "ggml-large-v3-turbo.bin",
    language: "auto",
    ocrLanguage: "eng+fra",
  });
});

it("falls back to defaults on corrupt JSON", () => {
  expect(store({ "w.json": "{not json" }).get()).toEqual(
    DEFAULT_WHISPER_CONFIG,
  );
});
