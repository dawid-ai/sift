import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  LOCAL_FORMAT_ID,
  filePathFromUrl,
  isLocalFileUrl,
  localFileMetadata,
  posterSeekSeconds,
} from "./local-file";

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

describe("posterSeekSeconds", () => {
  it("takes 10% of the duration inside the clamp", () => {
    expect(posterSeekSeconds(600)).toBe(60); // 10-minute talk → 1:00
    expect(posterSeekSeconds(300)).toBe(30);
  });

  it("floors at 5s so a short clip's poster isn't a black frame or a fade-in", () => {
    expect(posterSeekSeconds(30)).toBe(5); // 10% would be 3s
    expect(posterSeekSeconds(90)).toBe(9); // above the floor, so proportional wins
  });

  it("ceilings at 120s so a long lecture's poster isn't buried mid-video", () => {
    expect(posterSeekSeconds(3 * 3600)).toBe(120);
  });

  it("falls back to the floor for unknown, zero, or nonsense durations", () => {
    expect(posterSeekSeconds(null)).toBe(5);
    expect(posterSeekSeconds(undefined)).toBe(5);
    expect(posterSeekSeconds(0)).toBe(5);
    expect(posterSeekSeconds(-10)).toBe(5);
    expect(posterSeekSeconds(Number.NaN)).toBe(5);
  });
});
