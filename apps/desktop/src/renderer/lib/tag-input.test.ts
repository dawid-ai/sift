import { describe, it, expect } from "vitest";
import { splitTagInput, tagSuggestions, applyTagPick } from "./tag-input";

const ALL = ["systems", "sync", "sqlite", "css", "compilers", "SQL"];

describe("splitTagInput", () => {
  it("treats the whole field as the term when there is no comma", () => {
    expect(splitTagInput("sq")).toEqual({ before: [], term: "sq" });
  });
  it("takes the term from after the last comma", () => {
    expect(splitTagInput("systems, sq")).toEqual({
      before: ["systems"],
      term: "sq",
    });
  });
  it("trims around every separator", () => {
    expect(splitTagInput("systems ,  css , sq")).toEqual({
      before: ["systems", "css"],
      term: "sq",
    });
  });
  it("gives an empty term for a trailing comma", () => {
    expect(splitTagInput("systems,")).toEqual({
      before: ["systems"],
      term: "",
    });
  });
  it("drops empty segments from doubled commas", () => {
    expect(splitTagInput("systems,,css,s")).toEqual({
      before: ["systems", "css"],
      term: "s",
    });
  });
});

describe("tagSuggestions", () => {
  it("matches on the term after the comma, not the whole field", () => {
    // The bug: "systems, sq" was matched literally and returned nothing.
    expect(tagSuggestions("systems, sq", ALL, [])).toEqual(["sqlite", "SQL"]);
  });
  it("still works with no comma typed", () => {
    expect(tagSuggestions("sq", ALL, [])).toEqual(["sqlite", "SQL"]);
  });
  it("excludes tags already attached to the media", () => {
    expect(tagSuggestions("s", ALL, ["systems"])).not.toContain("systems");
  });
  it("excludes tags already typed earlier in the same field", () => {
    expect(tagSuggestions("sqlite, s", ALL, [])).not.toContain("sqlite");
  });
  it("is case-insensitive both ways", () => {
    expect(tagSuggestions("SYSTEMS, sql", ALL, [])).toEqual(["sqlite", "SQL"]);
    expect(tagSuggestions("s", ALL, ["SYSTEMS"])).not.toContain("systems");
  });
  it("returns nothing for an empty term, so a trailing comma opens no popover", () => {
    expect(tagSuggestions("systems, ", ALL, [])).toEqual([]);
    expect(tagSuggestions("", ALL, [])).toEqual([]);
  });
});

describe("applyTagPick", () => {
  it("keeps the tags typed before the term", () => {
    expect(applyTagPick("systems, sq", "sqlite")).toBe("systems, sqlite");
  });
  it("replaces a lone term", () => {
    expect(applyTagPick("sq", "sqlite")).toBe("sqlite");
  });
  it("normalises spacing around earlier separators", () => {
    expect(applyTagPick("systems ,css, sq", "sqlite")).toBe(
      "systems, css, sqlite",
    );
  });
  it("appends after a trailing comma instead of replacing", () => {
    expect(applyTagPick("systems,", "css")).toBe("systems, css");
  });
});
