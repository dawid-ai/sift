import { describe, it, expect } from "vitest";
import { tagColor, TAG_PALETTE } from "./tag-color";

describe("tagColor", () => {
  it("is deterministic", () => {
    expect(tagColor("Music")).toEqual(tagColor("Music"));
  });
  it("maps into the palette", () => {
    for (const name of ["a", "Music", "News", "very long tag name", "z"]) {
      expect(TAG_PALETTE).toContainEqual(tagColor(name));
    }
  });
  it("is case-insensitive (matches NOCASE storage)", () => {
    expect(tagColor("Music")).toEqual(tagColor("music"));
  });
});
