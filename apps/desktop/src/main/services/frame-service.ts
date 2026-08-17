import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import jpeg from "jpeg-js";
import {
  brightPixelFraction,
  computeDHash,
  isDataFrame,
  isDuplicateHash,
  MIN_FULLSCREEN_BRIGHT_FRACTION,
  type KeepFrameOptions,
} from "@sift/core";
import type { FrameRow, SiftDatabase } from "@sift/db";
import { deleteAutoFramesByMediaId, insertFrame } from "@sift/db";
import type { FfmpegRunner, FrameCrop } from "../sidecars/ffmpeg";
import type { OcrRunner } from "../sidecars/ocr";
import type { FrameClassifier } from "./frame-classifier";

// Note: no `../paths` import (which pulls in `electron`) — this service stays loadable
// under plain Node for Vitest, mirroring download-service.ts / summarize-service.ts.
// `framesDir` is injected for the same reason.

/** Default perceptual hash of a frame image: decode the JPEG, dHash it. Undecodable →
 * null (treated as unique, so a broken decode never silently drops a frame). Injectable
 * so tests exercise dedup without real JPEGs. */
function defaultHashFrame(imagePath: string): string | null {
  try {
    const decoded = jpeg.decode(readFileSync(imagePath), {
      useTArray: true,
      maxMemoryUsageInMB: 512,
    });
    return computeDHash(decoded);
  } catch {
    return null;
  }
}

/** Bright-pixel fraction of a frame (decodes the JPEG). Undecodable → null (don't drop). */
function defaultBrightFraction(imagePath: string): number | null {
  try {
    const decoded = jpeg.decode(readFileSync(imagePath), {
      useTArray: true,
      maxMemoryUsageInMB: 512,
    });
    return brightPixelFraction(decoded);
  } catch {
    return null;
  }
}

export interface FrameServiceOpts {
  db: SiftDatabase;
  ffmpeg: FfmpegRunner;
  makeOcr: () => OcrRunner; // a fresh worker per run; closed when the run ends
  framesDir: (mediaId: number) => string; // absolute per-media dir for frame images
  hashFrame?: (imagePath: string) => string | null; // perceptual hash for de-dup
  brightFraction?: (imagePath: string) => number | null; // for the full-screen-slide gate
  keep?: KeepFrameOptions;
  sceneThreshold?: number;
}

export interface FrameProgress {
  stage: "extracting" | "reading" | "done";
  /** 0..1 scan position while `extracting` (null when the video duration is unknown). */
  ratio: number | null;
  processed: number;
  total: number;
  kept: number;
}

/**
 * The timestamps to grab, given the detected scene-change times. Each grab sits at the
 * MIDPOINT of its segment — maximally far from both cut boundaries, so it's the stable held
 * content (not a fade/transition) and matches whatever frame the player lands on when the
 * thumbnail is clicked. A synthetic 0 is prepended so the opening segment is captured.
 */
export function settledGrabTimes(
  sceneTimes: number[],
  endSec: number,
): number[] {
  const bounds = [0, ...sceneTimes];
  return bounds.map((t, i) => {
    const next = i + 1 < bounds.length ? bounds[i + 1]! : endSec;
    return t + Math.max(0, next - t) / 2;
  });
}

/**
 * Pulls data-bearing frames from a downloaded video. Two phases: (1) SCAN the whole video for
 * scene-change times; (2) for each segment, grab the frame SETTLE seconds after the change —
 * the settled slide, not the transition/outgoing talking head — then dedup (dHash), optionally
 * AI-classify, and OCR-gate it. Kept frames persist as `frame` rows; rejected image files are
 * deleted. Idempotent per media (drops prior AUTO frames, keeps manual captures). Applies the
 * crop to each grabbed frame.
 */
export class FrameService {
  constructor(private readonly opts: FrameServiceOpts) {}

  async extract(
    input: {
      mediaId: number;
      videoPath: string;
      durationSec?: number | null;
      crop?: FrameCrop;
      /** Keep only full-screen (bright) slides — drop wide room/camera shots. */
      fullScreenOnly?: boolean;
      /** When set, an AI vision check runs per candidate; non-slides are dropped. */
      classifier?: FrameClassifier;
    },
    onProgress?: (p: FrameProgress) => void,
  ): Promise<FrameRow[]> {
    const { db, ffmpeg, makeOcr, framesDir } = this.opts;
    const hashFrame = this.opts.hashFrame ?? defaultHashFrame;
    const brightFraction = this.opts.brightFraction ?? defaultBrightFraction;
    const dir = framesDir(input.mediaId);
    mkdirSync(dir, { recursive: true });
    deleteAutoFramesByMediaId(db, input.mediaId); // keep the user's manual captures

    // Phase 1: scan for scene-change times (one decode pass; progress by scan position).
    const duration =
      input.durationSec && input.durationSec > 0 ? input.durationSec : null;
    onProgress?.({
      stage: "extracting",
      ratio: 0,
      processed: 0,
      total: 0,
      kept: 0,
    });
    const sceneTimes = await ffmpeg.detectSceneTimes({
      inputPath: input.videoPath,
      sceneThreshold: this.opts.sceneThreshold,
      onProgress: (seconds) => {
        const ratio = duration ? Math.min(1, seconds / duration) : null;
        onProgress?.({
          stage: "extracting",
          ratio,
          processed: 0,
          total: 0,
          kept: 0,
        });
      },
    });
    // Last segment needs an end; use the known duration, else a short tail past the last cut.
    const endSec = duration ?? (sceneTimes.at(-1) ?? 0) + 2;
    const grabTimes = settledGrabTimes(sceneTimes, endSec);

    // Phase 2: grab each settled frame, then dedup → classify → OCR-gate.
    const ocr = makeOcr();
    const kept: FrameRow[] = [];
    const keptHashes: string[] = [];
    try {
      for (let i = 0; i < grabTimes.length; i++) {
        const tsMs = Math.round(grabTimes[i]! * 1000);
        onProgress?.({
          stage: "reading",
          ratio: null,
          processed: i,
          total: grabTimes.length,
          kept: kept.length,
        });

        const imagePath = join(
          dir,
          `frame-${String(i + 1).padStart(4, "0")}.jpg`,
        );
        await ffmpeg.extractFrameAt({
          inputPath: input.videoPath,
          outputPath: imagePath,
          seconds: grabTimes[i]!,
          crop: input.crop,
        });

        // Dedup BEFORE OCR — a repeat of a kept slide skips the expensive OCR entirely.
        const hash = hashFrame(imagePath);
        if (hash && isDuplicateHash(hash, keptHashes)) {
          rmSync(imagePath, { force: true });
          continue;
        }

        // Full-screen-slide gate: drop wide room/camera shots (dark surround) before the
        // costlier OCR/AI steps. A null fraction (undecodable) never drops the frame.
        if (input.fullScreenOnly) {
          const frac = brightFraction(imagePath);
          if (frac !== null && frac < MIN_FULLSCREEN_BRIGHT_FRACTION) {
            rmSync(imagePath, { force: true });
            continue;
          }
        }

        // Optional AI vision gate: drop talking heads / rooms / webcam frames that the
        // text-density gate can't distinguish. Errors propagate (fail the run loudly).
        if (input.classifier && !(await input.classifier.classify(imagePath))) {
          rmSync(imagePath, { force: true });
          continue;
        }

        const result = await ocr.recognize(imagePath);
        if (!isDataFrame(result, this.opts.keep)) {
          rmSync(imagePath, { force: true }); // scenery/noise — don't keep the file
          continue;
        }
        kept.push(
          insertFrame(db, {
            media_id: input.mediaId,
            ts_ms: tsMs,
            image_path: imagePath,
            ocr_text: result.text,
            ocr_confidence: result.meanConfidence,
            phash: hash,
            kind: "slide",
          }),
        );
        if (hash) keptHashes.push(hash);
      }
    } finally {
      await ocr.close();
    }

    onProgress?.({
      stage: "done",
      ratio: 1,
      processed: grabTimes.length,
      total: grabTimes.length,
      kept: kept.length,
    });
    return kept;
  }

  /**
   * Grabs a single frame at `tsMs` (the user clicked "capture" while watching), OCRs it, and
   * stores it as a manual frame — no keep-gate or dedup, because the user chose it. Returns the
   * row so the caller can surface it immediately.
   */
  async captureFrame(input: {
    mediaId: number;
    videoPath: string;
    tsMs: number;
    crop?: FrameCrop;
  }): Promise<FrameRow> {
    const { db, ffmpeg, makeOcr, framesDir } = this.opts;
    const dir = framesDir(input.mediaId);
    mkdirSync(dir, { recursive: true });
    const imagePath = join(dir, `manual-${input.tsMs}.jpg`);
    await ffmpeg.extractFrameAt({
      inputPath: input.videoPath,
      outputPath: imagePath,
      seconds: input.tsMs / 1000,
      crop: input.crop,
    });

    const ocr = makeOcr();
    let ocrText: string | null = null;
    let ocrConfidence: number | null = null;
    try {
      const result = await ocr.recognize(imagePath);
      ocrText = result.text;
      ocrConfidence = result.meanConfidence;
    } finally {
      await ocr.close();
    }

    const hash = (this.opts.hashFrame ?? defaultHashFrame)(imagePath);
    return insertFrame(db, {
      media_id: input.mediaId,
      ts_ms: input.tsMs,
      image_path: imagePath,
      ocr_text: ocrText,
      ocr_confidence: ocrConfidence,
      phash: hash,
      kind: "manual",
    });
  }
}
