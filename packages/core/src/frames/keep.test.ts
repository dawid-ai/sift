import { describe, expect, it } from "vitest";
import { isDataFrame } from "./keep";

describe("isDataFrame", () => {
  it("keeps a dense, high-confidence frame (a slide)", () => {
    expect(isDataFrame({ wordCount: 24, meanConfidence: 88 })).toBe(true);
  });

  it("rejects a frame with too few words (scenery / a face)", () => {
    expect(isDataFrame({ wordCount: 2, meanConfidence: 95 })).toBe(false);
  });

  it("rejects noisy OCR on a busy background (low confidence)", () => {
    expect(isDataFrame({ wordCount: 40, meanConfidence: 30 })).toBe(false);
  });

  it("respects caller overrides", () => {
    expect(
      isDataFrame({ wordCount: 3, meanConfidence: 70 }, { minWords: 3 }),
    ).toBe(true);
  });
});
