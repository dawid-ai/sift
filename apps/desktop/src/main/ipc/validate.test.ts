import { describe, expect, it } from "vitest";
import { isKeyedAiProviderId } from "@sift/core";
import { absPath, httpUrl, id, int, oneOf, strArray } from "./validate";
import { downloadOption, frameCrop, mediaFilter } from "./validate-payloads";

describe("httpUrl", () => {
  it("accepts http and https", () => {
    expect(httpUrl("https://example.com/x", "url")).toBe(
      "https://example.com/x",
    );
    expect(httpUrl("http://example.com", "url")).toBe("http://example.com");
  });

  it("rejects schemes the OS would hand to another application", () => {
    for (const bad of [
      "file:///C:/Windows/System32/calc.exe",
      "javascript:alert(1)",
      "ms-msdt:/id",
      "not a url",
      42,
    ])
      expect(() => httpUrl(bad, "url")).toThrow();
  });
});

describe("id", () => {
  it("rejects non-positive, fractional, and non-numeric values", () => {
    expect(id(7, "id")).toBe(7);
    for (const bad of [0, -1, 1.5, "1", null, NaN])
      expect(() => id(bad, "id")).toThrow();
  });
});

describe("absPath", () => {
  it("rejects relative paths and embedded NUL", () => {
    expect(() => absPath("relative/file.mp4", "path")).toThrow();
    expect(() => absPath("C:\\ok\\file\u0000.mp4", "path")).toThrow();
  });
});

describe("isKeyedAiProviderId", () => {
  it("allows only the keyed providers", () => {
    expect(isKeyedAiProviderId("anthropic")).toBe(true);
    expect(isKeyedAiProviderId("openai")).toBe(true);
    expect(isKeyedAiProviderId("custom")).toBe(true);
  });

  it("rejects ids that would escape the secrets directory", () => {
    for (const bad of [
      "../../config",
      "..\\..\\config",
      "anthropic/../../x",
      "ollama",
      "",
    ])
      expect(isKeyedAiProviderId(bad)).toBe(false);
  });
});

describe("frameCrop", () => {
  it("accepts a rectangle inside the frame", () => {
    expect(frameCrop({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 })).toEqual({
      x: 0.1,
      y: 0.1,
      w: 0.5,
      h: 0.5,
    });
  });

  it("rejects out-of-range values and rectangles past the edge", () => {
    // The values are interpolated into an ffmpeg `crop=` filter expression, so anything
    // outside 0..1 is both a broken crop and a filter-injection vector.
    expect(() => frameCrop({ x: -1, y: 0, w: 0.5, h: 0.5 })).toThrow();
    expect(() => frameCrop({ x: 0.8, y: 0, w: 0.5, h: 0.5 })).toThrow();
    expect(() => frameCrop({ x: "0", y: 0, w: 0.5, h: 0.5 })).toThrow();
  });
});

describe("downloadOption", () => {
  it("keeps a normal yt-dlp selector", () => {
    const o = downloadOption({
      id: "1080p",
      label: "1080p",
      detail: "MP4",
      selector: "bestvideo[height<=1080]+bestaudio/best",
      approxBytes: 1234,
      kind: "video",
    });
    expect(o.selector).toBe("bestvideo[height<=1080]+bestaudio/best");
  });

  it("rejects control characters in the selector", () => {
    expect(() =>
      downloadOption({ selector: "best\nid", id: "x", kind: "video" }),
    ).toThrow();
  });
});

describe("mediaFilter", () => {
  it("normalizes a missing filter to an empty one", () => {
    expect(mediaFilter(undefined)).toEqual({});
  });

  it("rejects a non-id in ids", () => {
    expect(() => mediaFilter({ ids: [1, "2"] })).toThrow();
  });
});

describe("primitives", () => {
  it("bounds integers and array lengths", () => {
    expect(int(5, "n", 1, 10)).toBe(5);
    expect(() => int(11, "n", 1, 10)).toThrow();
    expect(() => strArray(["a", "b"], "a", 1)).toThrow();
    expect(() => oneOf("nope", "kind", ["video", "audio"] as const)).toThrow();
  });
});
