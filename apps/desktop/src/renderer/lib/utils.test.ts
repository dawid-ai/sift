import { describe, it, expect } from "vitest";
import { externalLinkUrl, mediaFileUrl, videoThumbUrl } from "./utils";

describe("externalLinkUrl", () => {
  it("passes http(s) through", () => {
    expect(externalLinkUrl("https://x.com/someone")).toBe("https://x.com/someone");
    expect(externalLinkUrl("HTTP://vimeo.com/user")).toBe("HTTP://vimeo.com/user");
  });

  it("rejects anything shell.openExternal shouldn't be handed", () => {
    // uploader_url comes from a scraped page via yt-dlp — untrusted input.
    expect(externalLinkUrl("file:///C:/Windows/System32/calc.exe")).toBeNull();
    expect(externalLinkUrl("javascript:alert(1)")).toBeNull();
    expect(externalLinkUrl("ms-msdt:/id")).toBeNull();
    expect(externalLinkUrl("//x.com/someone")).toBeNull();
    expect(externalLinkUrl(null)).toBeNull();
    expect(externalLinkUrl(undefined)).toBeNull();
    expect(externalLinkUrl("")).toBeNull();
  });
});

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

  it("routes an imported file's local poster path through sift-poster", () => {
    // media.thumbnail_path holds a remote URL for downloads but an absolute path for imports.
    expect(videoThumbUrl("C:\\Users\\d\\AppData\\Roaming\\Sift\\posters\\7.jpg")).toBe(
      "sift-poster://file/C%3A%5CUsers%5Cd%5CAppData%5CRoaming%5CSift%5Cposters%5C7.jpg",
    );
    expect(videoThumbUrl("/home/d/.config/Sift/posters/7.jpg")).toBe(
      "sift-poster://file/%2Fhome%2Fd%2F.config%2FSift%2Fposters%2F7.jpg",
    );
  });

  it("returns undefined for empty/nullish input", () => {
    expect(videoThumbUrl(null)).toBeUndefined();
    expect(videoThumbUrl(undefined)).toBeUndefined();
    expect(videoThumbUrl("")).toBeUndefined();
  });
});
