import { describe, expect, it } from "vitest";
import {
  activeSegmentIndex,
  appendTimeParam,
  formatTimestamp,
} from "./transcript-view";

it("formats mm:ss and h:mm:ss", () => {
  expect(formatTimestamp(5)).toBe("0:05");
  expect(formatTimestamp(65)).toBe("1:05");
  expect(formatTimestamp(3725)).toBe("1:02:05");
});

it("appends a t= param, respecting existing query", () => {
  expect(appendTimeParam("https://youtu.be/x", 90)).toBe(
    "https://youtu.be/x?t=90s",
  );
  expect(appendTimeParam("https://www.youtube.com/watch?v=x", 90)).toBe(
    "https://www.youtube.com/watch?v=x&t=90s",
  );
});

describe("activeSegmentIndex", () => {
  const segs = [{ start: 0 }, { start: 5 }, { start: 10 }];
  it("returns -1 for empty", () => expect(activeSegmentIndex([], 3)).toBe(-1));
  it("returns -1 before the first start", () =>
    expect(activeSegmentIndex(segs, -1)).toBe(-1));
  it("matches the exact boundary", () =>
    expect(activeSegmentIndex(segs, 5)).toBe(1));
  it("returns the lower segment when between", () =>
    expect(activeSegmentIndex(segs, 7)).toBe(1));
  it("returns the last after the final start", () =>
    expect(activeSegmentIndex(segs, 999)).toBe(2));
});
