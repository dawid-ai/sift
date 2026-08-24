import { describe, expect, it } from "vitest";
import {
  clipArgs,
  MAX_CLIP_SECONDS,
  normalizeRange,
  supportsTimestampLink,
  timestampedUrl,
} from "./clip";

describe("timestampedUrl", () => {
  it("uses each platform's own parameter", () => {
    expect(
      timestampedUrl("https://www.youtube.com/watch?v=abc", 125),
    ).toContain("t=125s");
    expect(timestampedUrl("https://youtu.be/abc", 125)).toContain("t=125");
    expect(timestampedUrl("https://vimeo.com/12345", 90)).toBe(
      "https://vimeo.com/12345#t=90s",
    );
    expect(timestampedUrl("https://www.twitch.tv/videos/1", 3725)).toContain(
      "t=1h2m5s",
    );
    expect(timestampedUrl("https://soundcloud.com/a/b", 65)).toBe(
      "https://soundcloud.com/a/b#t=1:05",
    );
  });

  it("keeps existing query parameters", () => {
    const out = timestampedUrl(
      "https://www.youtube.com/watch?v=abc&list=PL1",
      10,
    );
    expect(out).toContain("v=abc");
    expect(out).toContain("list=PL1");
    expect(out).toContain("t=10s");
  });

  it("replaces a timestamp already present rather than appending a second one", () => {
    const out = timestampedUrl("https://www.youtube.com/watch?v=a&t=5s", 60);
    expect(out).toContain("t=60s");
    expect(out.match(/t=/g)).toHaveLength(1);
  });

  it("returns the URL unchanged for a platform with no known parameter", () => {
    const url = "https://example.com/video/1";
    expect(timestampedUrl(url, 30)).toBe(url);
    expect(supportsTimestampLink(url)).toBe(false);
    expect(supportsTimestampLink("https://youtu.be/x")).toBe(true);
  });

  it("survives a malformed URL and floors a fractional time", () => {
    expect(timestampedUrl("not a url", 10)).toBe("not a url");
    expect(timestampedUrl("https://youtu.be/x", 12.9)).toContain("t=12");
    expect(timestampedUrl("https://youtu.be/x", -5)).toContain("t=0");
  });
});

describe("normalizeRange", () => {
  it("orders a backwards span", () => {
    expect(normalizeRange({ startSeconds: 90, endSeconds: 30 })).toEqual({
      startSeconds: 30,
      endSeconds: 90,
    });
  });

  it("clamps a negative start", () => {
    const out = normalizeRange({ startSeconds: -10, endSeconds: 5 });
    expect(out.startSeconds).toBe(0);
    expect(out.endSeconds).toBe(5);
  });

  it("caps the length so one drag cannot ask for the whole file", () => {
    const out = normalizeRange({ startSeconds: 0, endSeconds: 999_999 });
    expect(out.endSeconds).toBe(MAX_CLIP_SECONDS);
  });
});

describe("clipArgs", () => {
  const range = { startSeconds: 10, endSeconds: 25 };

  it("seeks before the input, so a long file does not decode from zero", () => {
    const args = clipArgs({
      inputPath: "in.mp4",
      outputPath: "out.mp4",
      kind: "video",
      range,
    });
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
    expect(args[args.indexOf("-t") + 1]).toBe("15.000");
  });

  it("stream-copies audio and video, and drops the video track for audio", () => {
    const audio = clipArgs({
      inputPath: "in.mp4",
      outputPath: "out.m4a",
      kind: "audio",
      range,
    });
    expect(audio).toContain("-vn");
    expect(audio).toContain("copy");
    expect(audio).not.toContain("libx264");

    const video = clipArgs({
      inputPath: "in.mp4",
      outputPath: "out.mp4",
      kind: "video",
      range,
    });
    expect(video).toContain("copy");
    expect(video).not.toContain("libx264");
  });

  it("re-encodes a vertical short and crops rather than letterboxing", () => {
    const args = clipArgs({
      inputPath: "in.mp4",
      outputPath: "out.mp4",
      kind: "vertical",
      range,
    });
    const filter = args[args.indexOf("-vf") + 1] ?? "";
    expect(filter).toContain("crop=");
    expect(filter).toContain("scale=1080:1920");
    expect(filter).not.toContain("pad=");
    expect(args).toContain("libx264");
  });

  it("puts the output last and never leaves a zero duration", () => {
    const args = clipArgs({
      inputPath: "in.mp4",
      outputPath: "out.mp4",
      kind: "video",
      range: { startSeconds: 5, endSeconds: 5 },
    });
    expect(args[args.length - 1]).toBe("out.mp4");
    expect(Number(args[args.indexOf("-t") + 1])).toBeGreaterThan(0);
  });
});
