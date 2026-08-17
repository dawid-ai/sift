import { describe, expect, it } from "vitest";
import { partitionDropped } from "./use-file-import";

describe("partitionDropped", () => {
  it("accepts a media file with a path, no notice", () => {
    const { entries, notice } = partitionDropped([
      { name: "clip.mp4", path: "C:/videos/clip.mp4" },
    ]);
    expect(entries).toEqual([{ path: "C:/videos/clip.mp4", name: "clip.mp4" }]);
    expect(notice).toBeNull();
  });

  it("rejects a non-media file with a notice naming it", () => {
    const { entries, notice } = partitionDropped([
      { name: "notes.zip", path: "C:/files/notes.zip" },
    ]);
    expect(entries).toEqual([]);
    expect(notice).toContain("Not an audio or video file");
    expect(notice).toContain("notes.zip");
  });

  it("rejects a media file with no path, naming it in the unreadable-path notice", () => {
    const { entries, notice } = partitionDropped([
      { name: "clip.mov", path: null },
    ]);
    expect(entries).toEqual([]);
    expect(notice).toContain("Couldn't read where");
    expect(notice).toContain("clip.mov");
  });

  it("accepts the media file in a mixed drop and still reports the rejected one", () => {
    const { entries, notice } = partitionDropped([
      { name: "clip.mp4", path: "C:/videos/clip.mp4" },
      { name: "notes.zip", path: "C:/files/notes.zip" },
    ]);
    expect(entries).toEqual([{ path: "C:/videos/clip.mp4", name: "clip.mp4" }]);
    expect(notice).toContain("notes.zip");
  });
});
