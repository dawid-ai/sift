import { describe, it, expect } from "vitest";
import { unionTags } from "./library-tags";

describe("unionTags", () => {
  it("collapses tags case-insensitively, keeping first-seen casing", () => {
    const items = [{ tags: ["Music"] }, { tags: ["music"] }];
    expect(unionTags(items)).toEqual(["Music"]);
  });

  it("sorts the result alphabetically", () => {
    const items = [{ tags: ["News", "Comedy"] }, { tags: ["art"] }];
    expect(unionTags(items)).toEqual(["art", "Comedy", "News"]);
  });

  it("returns an empty array for empty input", () => {
    expect(unionTags([])).toEqual([]);
  });
});
