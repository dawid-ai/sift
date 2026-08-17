import { describe, expect, it } from "vitest";
import { medianViews, outlierScore, OUTLIER_THRESHOLD } from "./outlier";

describe("medianViews", () => {
  it("returns the middle value for an odd count", () => {
    expect(
      medianViews([{ viewCount: 10 }, { viewCount: 100 }, { viewCount: 30 }]),
    ).toBe(30);
  });

  it("averages the two middle values for an even count", () => {
    expect(
      medianViews([
        { viewCount: 10 },
        { viewCount: 20 },
        { viewCount: 30 },
        { viewCount: 60 },
      ]),
    ).toBe(25);
  });

  it("ignores videos with no view count", () => {
    expect(
      medianViews([
        { viewCount: null },
        { viewCount: 40 },
        { viewCount: null },
      ]),
    ).toBe(40);
  });

  it("returns null when nothing has a view count", () => {
    expect(medianViews([{ viewCount: null }])).toBeNull();
    expect(medianViews([])).toBeNull();
  });
});

describe("outlierScore", () => {
  it("is views divided by the median", () => {
    expect(outlierScore(300, 100)).toBe(3);
    expect(outlierScore(50, 100)).toBe(0.5);
  });

  it("is null when either input is missing or the median is zero", () => {
    expect(outlierScore(null, 100)).toBeNull();
    expect(outlierScore(300, null)).toBeNull();
    expect(outlierScore(300, 0)).toBeNull();
  });

  it("uses a threshold of 2", () => {
    expect(OUTLIER_THRESHOLD).toBe(2);
  });
});
