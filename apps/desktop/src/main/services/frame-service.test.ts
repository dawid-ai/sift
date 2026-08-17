import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { openTestDatabase } from "@sift/db/testing";
import { getFramesByMediaId, insertMedia, runMigrations } from "@sift/db";
import type { NewMedia, SiftDatabase } from "@sift/db";
import {
  FrameService,
  settledGrabTimes,
  type FrameProgress,
} from "./frame-service";
import type { OcrResult, OcrRunner } from "../sidecars/ocr";

function media(db: SiftDatabase): number {
  const m: NewMedia = {
    source_url: "https://y/1",
    platform_id: "youtube",
    external_id: "abc",
    title: "Talk",
    uploader: "Chan",
    uploader_url: null,
    duration_s: 100,
    thumbnail_path: null,
    view_count: null,
    like_count: null,
    published_at: null,
    metadata_json: null,
    download_status: "downloaded",
  };
  return insertMedia(db, m).id;
}

const slide = (text: string): OcrResult => ({
  text,
  wordCount: text.split(/\s+/).length,
  meanConfidence: 90,
});
const scenery: OcrResult = { text: "hi", wordCount: 1, meanConfidence: 95 };

/** A fake ffmpeg whose scene scan returns `sceneTimes` and whose grab writes a real file. */
function fakeFfmpeg(sceneTimes: number[]) {
  return {
    extractWav: vi.fn(),
    detectSceneTimes: vi.fn().mockResolvedValue(sceneTimes),
    extractFrameAt: vi.fn(async ({ outputPath }: { outputPath: string }) =>
      writeFileSync(outputPath, "x"),
    ),
  };
}

describe("settledGrabTimes", () => {
  it("grabs the midpoint of each segment (synthetic 0 leads the list)", () => {
    // segments [0,10],[10,20],[20,100] → midpoints 5, 15, 60.
    expect(settledGrabTimes([10, 20], 100)).toEqual([5, 15, 60]);
  });
  it("handles a quick cut (short segment midpoint)", () => {
    expect(settledGrabTimes([10, 10.5], 100)[1]).toBe(10.25);
  });
});

describe("FrameService.extract", () => {
  it("grabs settled frames, keeps slides, drops scenery (row + file), closes OCR", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const mid = media(db);
    const dir = mkdtempSync(join(tmpdir(), "sift-frames-"));
    const [f1, f2, f3] = [
      "frame-0001.jpg",
      "frame-0002.jpg",
      "frame-0003.jpg",
    ].map((n) => join(dir, n));

    const ffmpeg = fakeFfmpeg([10, 20]); // + prepended 0 → midpoints 5, 15, 60
    const byPath: Record<string, OcrResult> = {
      [f1!]: slide("Q3 Revenue up forty percent"),
      [f2!]: scenery,
      [f3!]: slide("Roadmap for next quarter shipping"),
    };
    const close = vi.fn().mockResolvedValue(undefined);
    const ocr: OcrRunner = {
      recognize: vi.fn(async (p: string) => byPath[p]!),
      close,
    };

    const progress: FrameProgress[] = [];
    const service = new FrameService({
      db,
      ffmpeg,
      makeOcr: () => ocr,
      framesDir: () => dir,
    });
    const kept = await service.extract(
      { mediaId: mid, videoPath: "/v.mp4" },
      (p) => progress.push(p),
    );

    expect(kept).toHaveLength(2);
    const rows = getFramesByMediaId(db, mid);
    expect(rows.map((r) => r.ts_ms)).toEqual([5000, 21000]); // segment midpoints (end = last cut + 2s)
    expect(rows[0]!.ocr_text).toBe("Q3 Revenue up forty percent");
    expect(rows[0]!.kind).toBe("slide");

    expect(existsSync(f1!)).toBe(true);
    expect(existsSync(f2!)).toBe(false); // rejected frame's file removed
    expect(existsSync(f3!)).toBe(true);

    expect(close).toHaveBeenCalledTimes(1);
    expect(progress.at(-1)).toEqual({
      stage: "done",
      ratio: 1,
      processed: 3,
      total: 3,
      kept: 2,
    });
  });

  it("drops a frame that perceptually repeats an already-kept slide (skips its OCR)", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const mid = media(db);
    const dir = mkdtempSync(join(tmpdir(), "sift-frames-"));
    const [, f2, f3] = [
      "frame-0001.jpg",
      "frame-0002.jpg",
      "frame-0003.jpg",
    ].map((n) => join(dir, n));

    const ffmpeg = fakeFfmpeg([10, 20]); // midpoints 5 (f1), 15 (f2), 60 (f3)
    // f1 and f3 hash the same (same slide); f2 is far away (16 bits > threshold).
    const hashFrame = (p: string): string => (p === f2 ? "0000" : "ffff");
    const recognize = vi.fn(async () => slide("Same slide text here again"));
    const ocr: OcrRunner = {
      recognize,
      close: vi.fn().mockResolvedValue(undefined),
    };

    const service = new FrameService({
      db,
      ffmpeg,
      makeOcr: () => ocr,
      framesDir: () => dir,
      hashFrame,
    });
    const kept = await service.extract({ mediaId: mid, videoPath: "/v.mp4" });

    expect(kept.map((r) => r.ts_ms)).toEqual([5000, 15000]); // f3 (dup of f1) dropped
    expect(recognize).toHaveBeenCalledTimes(2); // f3 never reached OCR
    expect(existsSync(f3!)).toBe(false); // duplicate file removed
    expect(kept[0]!.phash).toBe("ffff");
  });

  it("drops frames the AI classifier rejects (before OCR)", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const mid = media(db);
    const dir = mkdtempSync(join(tmpdir(), "sift-frames-"));
    const [f1, f2] = ["frame-0001.jpg", "frame-0002.jpg"].map((n) =>
      join(dir, n),
    );

    const ffmpeg = fakeFfmpeg([20]); // midpoints 10 (f1), 60 (f2)
    const recognize = vi.fn(async () =>
      slide("Real slide with plenty of text"),
    );
    const ocr: OcrRunner = {
      recognize,
      close: vi.fn().mockResolvedValue(undefined),
    };
    const classify = vi.fn(async (p: string) => p === f1); // only f1 is a slide

    const service = new FrameService({
      db,
      ffmpeg,
      makeOcr: () => ocr,
      framesDir: () => dir,
    });
    const kept = await service.extract({
      mediaId: mid,
      videoPath: "/v.mp4",
      classifier: { classify },
    });

    expect(kept.map((r) => r.ts_ms)).toEqual([10000]);
    expect(recognize).toHaveBeenCalledTimes(1); // f2 rejected before OCR
    expect(existsSync(f2!)).toBe(false);
  });

  it("fullScreenOnly drops dark room shots, keeps bright full-screen slides", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const mid = media(db);
    const dir = mkdtempSync(join(tmpdir(), "sift-frames-"));
    const [f1, f2] = ["frame-0001.jpg", "frame-0002.jpg"].map((n) =>
      join(dir, n),
    );

    const ffmpeg = fakeFfmpeg([20]); // midpoints f1 (10s), f2 (60s)
    const brightFraction = (p: string): number => (p === f1 ? 0.85 : 0.35); // f1 slide, f2 room
    const recognize = vi.fn(async () => slide("Bright full screen slide text"));
    const ocr: OcrRunner = {
      recognize,
      close: vi.fn().mockResolvedValue(undefined),
    };

    const service = new FrameService({
      db,
      ffmpeg,
      makeOcr: () => ocr,
      framesDir: () => dir,
      brightFraction,
    });
    const kept = await service.extract({
      mediaId: mid,
      videoPath: "/v.mp4",
      fullScreenOnly: true,
    });

    expect(kept.map((r) => r.ts_ms)).toEqual([10000]); // only the bright frame
    expect(recognize).toHaveBeenCalledTimes(1); // dark room shot dropped before OCR
    expect(existsSync(f2!)).toBe(false);
  });

  it("passes the crop through to each grabbed frame", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const mid = media(db);
    const dir = mkdtempSync(join(tmpdir(), "sift-frames-"));
    const ffmpeg = fakeFfmpeg([20]);
    const ocr: OcrRunner = {
      recognize: vi.fn(async () => slide("One two three four five")),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const crop = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
    const service = new FrameService({
      db,
      ffmpeg,
      makeOcr: () => ocr,
      framesDir: () => dir,
    });
    await service.extract({ mediaId: mid, videoPath: "/v.mp4", crop });
    expect(ffmpeg.extractFrameAt).toHaveBeenCalledWith(
      expect.objectContaining({ crop }),
    );
  });

  it("captureFrame grabs one frame at a timestamp, OCRs it, stores it as manual", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const mid = media(db);
    const dir = mkdtempSync(join(tmpdir(), "sift-frames-"));
    const ffmpeg = fakeFfmpeg([]);
    const ocr: OcrRunner = {
      recognize: vi.fn(async () => slide("Manually grabbed slide text")),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const service = new FrameService({
      db,
      ffmpeg,
      makeOcr: () => ocr,
      framesDir: () => dir,
    });

    const row = await service.captureFrame({
      mediaId: mid,
      videoPath: "/v.mp4",
      tsMs: 42_000,
    });
    expect(row.kind).toBe("manual");
    expect(row.ts_ms).toBe(42_000);
    expect(row.included).toBe(1);
    expect(row.ocr_text).toBe("Manually grabbed slide text");
    expect(ffmpeg.extractFrameAt).toHaveBeenCalledWith(
      expect.objectContaining({
        seconds: 42,
        outputPath: join(dir, "manual-42000.jpg"),
      }),
    );
    expect(getFramesByMediaId(db, mid).map((r) => r.kind)).toEqual(["manual"]);
  });

  it("re-extract keeps manual captures but replaces auto frames", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const mid = media(db);
    const dir = mkdtempSync(join(tmpdir(), "sift-frames-"));
    const ffmpeg = fakeFfmpeg([20]);
    const makeOcr = (): OcrRunner => ({
      recognize: vi.fn(async () => slide("One two three four five")),
      close: vi.fn().mockResolvedValue(undefined),
    });
    const service = new FrameService({
      db,
      ffmpeg,
      makeOcr,
      framesDir: () => dir,
    });

    await service.captureFrame({
      mediaId: mid,
      videoPath: "/v.mp4",
      tsMs: 5000,
    });
    await service.extract({ mediaId: mid, videoPath: "/v.mp4" });
    const kinds = getFramesByMediaId(db, mid).map((r) => r.kind);
    expect(kinds).toContain("manual");
    expect(kinds).toContain("slide");
  });

  it("is idempotent: a re-run replaces prior auto frames for the media", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const mid = media(db);
    const dir = mkdtempSync(join(tmpdir(), "sift-frames-"));
    const ffmpeg = fakeFfmpeg([20]); // 2 auto frames per run
    const makeOcr = (): OcrRunner => ({
      recognize: vi.fn(async () => slide("One two three four five")),
      close: vi.fn().mockResolvedValue(undefined),
    });
    const service = new FrameService({
      db,
      ffmpeg,
      makeOcr,
      framesDir: () => dir,
    });

    await service.extract({ mediaId: mid, videoPath: "/v.mp4" });
    await service.extract({ mediaId: mid, videoPath: "/v.mp4" });
    expect(getFramesByMediaId(db, mid)).toHaveLength(2); // not 4
  });
});
