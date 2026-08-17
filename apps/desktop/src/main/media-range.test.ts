import { describe, it, expect } from "vitest";
import { parseRange, mediaContentType } from "./media-range";

describe("parseRange", () => {
  const size = 1000;
  it("returns null for an absent header (serve full body)", () => {
    expect(parseRange(null, size)).toBeNull();
  });
  it("returns null for a malformed header", () => {
    expect(parseRange("bytes=abc", size)).toBeNull();
    expect(parseRange("kilobytes=0-1", size)).toBeNull();
    expect(parseRange("bytes=-", size)).toBeNull();
  });
  it("honors an open-ended range (bytes=0-) to EOF", () => {
    expect(parseRange("bytes=0-", size)).toEqual({ start: 0, end: 999 });
  });
  it("honors a closed range", () => {
    expect(parseRange("bytes=100-200", size)).toEqual({ start: 100, end: 200 });
  });
  it("honors a start-only range", () => {
    expect(parseRange("bytes=500-", size)).toEqual({ start: 500, end: 999 });
  });
  it("clamps an end past EOF", () => {
    expect(parseRange("bytes=100-99999", size)).toEqual({
      start: 100,
      end: 999,
    });
  });
  it("resolves a suffix range to the last N bytes", () => {
    expect(parseRange("bytes=-300", size)).toEqual({ start: 700, end: 999 });
  });
  it("clamps a suffix larger than the file to the whole file", () => {
    expect(parseRange("bytes=-99999", size)).toEqual({ start: 0, end: 999 });
  });
  it("reports an out-of-bounds start as unsatisfiable", () => {
    expect(parseRange("bytes=1000-", size)).toBe("unsatisfiable");
    expect(parseRange("bytes=1500-2000", size)).toBe("unsatisfiable");
  });
  it("reports a zero-length suffix as unsatisfiable", () => {
    expect(parseRange("bytes=-0", size)).toBe("unsatisfiable");
  });
});

describe("mediaContentType", () => {
  it("maps known video/audio extensions", () => {
    expect(mediaContentType("C:\\v\\a.mp4")).toBe("video/mp4");
    expect(mediaContentType("/x/b.webm")).toBe("video/webm");
    expect(mediaContentType("/x/c.m4a")).toBe("audio/mp4");
  });
  it("is case-insensitive", () => {
    expect(mediaContentType("/x/D.MP4")).toBe("video/mp4");
  });
  it("defaults to a generic binary type", () => {
    expect(mediaContentType("/x/e.xyz")).toBe("application/octet-stream");
  });
});
