import { describe, expect, it } from "vitest";
import { MEDIA_EXTENSIONS, isMediaFile } from "./extensions";

describe("isMediaFile", () => {
  it("accepts common video and audio containers", () => {
    expect(isMediaFile("Team Standup.mp4")).toBe(true);
    expect(isMediaFile("lecture.mkv")).toBe(true);
    expect(isMediaFile("interview.m4a")).toBe(true);
    expect(isMediaFile("notes.opus")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isMediaFile("HOLIDAY.MOV")).toBe(true);
    expect(isMediaFile("Podcast.MP3")).toBe(true);
  });

  it("rejects non-media files, extensionless names, and dotfiles", () => {
    expect(isMediaFile("archive.zip")).toBe(false);
    expect(isMediaFile("notes.txt")).toBe(false);
    expect(isMediaFile("README")).toBe(false);
    expect(isMediaFile(".gitignore")).toBe(false);
  });

  it("exposes the extensions bare, for Electron's dialog filter", () => {
    for (const ext of MEDIA_EXTENSIONS) {
      expect(ext.startsWith(".")).toBe(false);
      expect(ext).toBe(ext.toLowerCase());
    }
  });
});
