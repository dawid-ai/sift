import { describe, it, expect } from "vitest";
import { mediaFileUrl, videoThumbUrl } from "./utils";

describe("mediaFileUrl", () => {
  it("encodes the path into the sift-media protocol", () => {
    expect(mediaFileUrl("C:\\v\\a b.mp4")).toBe("sift-media://file/C%3A%5Cv%5Ca%20b.mp4");
  });
});

describe("videoThumbUrl", () => {
  it("routes YouTube-CDN thumbnails through the sift-thumb cache", () => {
    expect(videoThumbUrl("https://i.ytimg.com/vi/abc/hqdefault.jpg")).toBe(
      "sift-thumb://img/https%3A%2F%2Fi.ytimg.com%2Fvi%2Fabc%2Fhqdefault.jpg",
    );
    expect(videoThumbUrl("https://yt3.ggpht.com/x")).toContain("sift-thumb://img/");
  });

  it("passes through non-cacheable hosts as the raw https URL", () => {
    const other = "https://pbs.twimg.com/media/x.jpg";
    expect(videoThumbUrl(other)).toBe(other);
  });

  it("coerces protocol-relative URLs to https before deciding", () => {
    expect(videoThumbUrl("//i.ytimg.com/vi/abc/hq.jpg")).toBe(
      "sift-thumb://img/https%3A%2F%2Fi.ytimg.com%2Fvi%2Fabc%2Fhq.jpg",
    );
  });

  it("returns undefined for empty/nullish input", () => {
    expect(videoThumbUrl(null)).toBeUndefined();
    expect(videoThumbUrl(undefined)).toBeUndefined();
    expect(videoThumbUrl("")).toBeUndefined();
  });
});
