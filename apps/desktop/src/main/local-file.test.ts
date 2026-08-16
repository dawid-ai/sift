import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  LOCAL_FORMAT_ID,
  filePathFromUrl,
  isLocalFileUrl,
  jpegSize,
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

/** Minimal but structurally real JPEG: SOI, an APP0 segment to skip past, an optional
 * DHT (shares SOF's marker range but is NOT a frame header), then SOF0, then EOI. */
function fakeJpeg(width: number, height: number, opts: { withDht?: boolean } = {}): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  const app0 = Buffer.alloc(4 + 12);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(14, 2); // segment length covers itself + payload
  parts.push(app0);
  if (opts.withDht) {
    const dht = Buffer.alloc(4 + 6);
    dht.writeUInt16BE(0xffc4, 0);
    dht.writeUInt16BE(8, 2);
    parts.push(dht);
  }
  const sof = Buffer.alloc(4 + 6);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(8, 2);
  sof.writeUInt8(8, 4); // sample precision
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  parts.push(sof, Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

describe("jpegSize", () => {
  it("reads the frame size out of SOF0, skipping earlier segments", () => {
    expect(jpegSize(fakeJpeg(1920, 1080))).toEqual({ width: 1920, height: 1080 });
    expect(jpegSize(fakeJpeg(3840, 2160))).toEqual({ width: 3840, height: 2160 });
  });

  it("does not mistake a huffman table for a frame header", () => {
    // 0xC4 sits inside the SOF marker range but is DHT — reading it as SOF yields garbage.
    expect(jpegSize(fakeJpeg(1280, 720, { withDht: true }))).toEqual({ width: 1280, height: 720 });
  });

  it("returns null rather than throwing on anything that isn't a parseable JPEG", () => {
    expect(jpegSize(Buffer.alloc(0))).toBeNull();
    expect(jpegSize(Buffer.from("not an image"))).toBeNull();
    expect(jpegSize(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull(); // no SOF
    expect(jpegSize(fakeJpeg(640, 480).subarray(0, 8))).toBeNull(); // truncated
  });

  it("terminates on a malformed segment length instead of looping", () => {
    // A zero-length segment would leave the cursor stuck without the `segment < 2` guard.
    expect(jpegSize(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0, 0, 0, 0, 0, 0]))).toBeNull();
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
