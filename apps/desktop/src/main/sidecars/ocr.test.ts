import { describe, expect, it, vi } from "vitest";
import { createOcrRunner, toOcrResult, workerOptions } from "./ocr";

describe("toOcrResult", () => {
  it("counts words and trims, passing confidence through", () => {
    expect(toOcrResult("  Q3 Revenue up 40%\n", 88.5)).toEqual({
      text: "Q3 Revenue up 40%",
      wordCount: 4,
      meanConfidence: 88.5,
    });
  });

  it("reports zero words for blank OCR (scenery)", () => {
    expect(toOcrResult("   \n ", 0)).toEqual({ text: "", wordCount: 0, meanConfidence: 0 });
  });
});

describe("createOcrRunner", () => {
  it("reuses one recognizer across frames and closes it once", async () => {
    const recognize = vi
      .fn()
      .mockResolvedValueOnce({ text: "one two three", confidence: 90 })
      .mockResolvedValueOnce({ text: "x", confidence: 10 });
    const close = vi.fn().mockResolvedValue(undefined);
    const make = vi.fn().mockResolvedValue({ recognize, close });
    const runner = createOcrRunner({ makeRecognizer: make });

    expect(await runner.recognize("/f1.jpg")).toEqual({
      text: "one two three", wordCount: 3, meanConfidence: 90,
    });
    await runner.recognize("/f2.jpg");
    await runner.close();

    expect(make).toHaveBeenCalledTimes(1); // single worker for both frames
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("workerOptions", () => {
  // Regression coverage for a real hang: tesseract.js defaults `gzip` to `true`, and with
  // a local (non-URL) `langPath` it then reads `<lang>.traineddata.gz`. The bundled
  // resources/tessdata file is plain, uncompressed `eng.traineddata`, so any `langPath`
  // must always come with `gzip: false` or the worker never resolves and never rejects.
  it("forces gzip: false whenever langPath is set", () => {
    expect(workerOptions({ langPath: "/resources/tessdata" })).toEqual({
      langPath: "/resources/tessdata",
      gzip: false,
    });
  });

  it("pairs langPath and cachePath, both with gzip: false", () => {
    expect(workerOptions({ langPath: "/resources/tessdata", cachePath: "/cache/tesseract" })).toEqual({
      langPath: "/resources/tessdata",
      cachePath: "/cache/tesseract",
      gzip: false,
    });
  });

  it("omits gzip entirely when langPath is unset, so tesseract.js's CDN default (gzip: true) still applies", () => {
    expect(workerOptions({ cachePath: "/cache/tesseract" })).toEqual({ cachePath: "/cache/tesseract" });
  });

  it("returns an empty object when nothing is set", () => {
    expect(workerOptions({})).toEqual({});
  });
});
