import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LOCAL_FORMAT_ID, filePathFromUrl, isLocalFileUrl, localFileMetadata } from "./local-file";

describe("localFileMetadata", () => {
  it("derives the title from the filename, without its extension", () => {
    const meta = localFileMetadata(join(tmpdir(), "Team Standup.mp4"));
    expect(meta.title).toBe("Team Standup");
  });

  it("round-trips a path with spaces and non-ASCII through the source URL", () => {
    const path = join(tmpdir(), "Æther talk 2026.mp4");
    const meta = localFileMetadata(path);
    expect(isLocalFileUrl(meta.sourceUrl)).toBe(true);
    expect(filePathFromUrl(meta.sourceUrl)).toBe(path);
  });

  it("reports no captions, so provider resolution falls through to Whisper", () => {
    const meta = localFileMetadata(join(tmpdir(), "a.mp4"));
    expect(meta.hasCaptions).toBe(false);
    expect(meta.captionLanguages).toEqual([]);
    expect(meta.formats).toEqual([]);
  });

  it("marks the platform as local without touching the yt-dlp platform registry", () => {
    const meta = localFileMetadata(join(tmpdir(), "a.mp4"));
    expect(meta.platform).toEqual({ id: "local", label: "Local file", tier: "tested" });
  });

  it("carries a probed duration when given one, else null", () => {
    expect(localFileMetadata(join(tmpdir(), "a.mp4"), 42.5).durationSec).toBe(42.5);
    expect(localFileMetadata(join(tmpdir(), "a.mp4")).durationSec).toBeNull();
  });

  it("does not mistake a remote URL for a local file", () => {
    expect(isLocalFileUrl("https://www.youtube.com/watch?v=abc")).toBe(false);
  });

  it("pins the provenance marker", () => {
    expect(LOCAL_FORMAT_ID).toBe("local");
  });
});
