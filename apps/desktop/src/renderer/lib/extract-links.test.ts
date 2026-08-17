import { describe, it, expect } from "vitest";
import { extractLinks } from "./extract-links";

describe("extractLinks", () => {
  it("returns [] for null/empty/no-url text", () => {
    expect(extractLinks(null)).toEqual([]);
    expect(extractLinks("")).toEqual([]);
    expect(extractLinks("just some words")).toEqual([]);
  });
  it("extracts http(s) urls", () => {
    expect(extractLinks("site https://a.com and http://b.org here")).toEqual([
      "https://a.com",
      "http://b.org",
    ]);
  });
  it("dedupes and preserves first-seen order", () => {
    expect(extractLinks("https://a.com then https://a.com again")).toEqual([
      "https://a.com",
    ]);
  });
  it("trims trailing sentence punctuation", () => {
    expect(extractLinks("visit https://a.com/path.")).toEqual([
      "https://a.com/path",
    ]);
  });
});
