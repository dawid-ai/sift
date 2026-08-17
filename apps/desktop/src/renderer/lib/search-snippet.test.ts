import { describe, it, expect } from "vitest";
import { highlightSegments } from "./search-snippet";

describe("highlightSegments", () => {
  it("marks the query case-insensitively", () => {
    expect(highlightSegments("the Quick fox", "quick")).toEqual([
      { text: "the ", match: false },
      { text: "Quick", match: true },
      { text: " fox", match: false },
    ]);
  });
  it("returns one unmarked segment when absent", () => {
    expect(highlightSegments("nothing here", "zzz")).toEqual([
      { text: "nothing here", match: false },
    ]);
  });
  it("handles regex-special chars literally", () => {
    expect(highlightSegments("a.b.c", ".")).toContainEqual({
      text: ".",
      match: true,
    });
  });
  it("empty query → single unmarked", () => {
    expect(highlightSegments("abc", "")).toEqual([
      { text: "abc", match: false },
    ]);
  });
});
