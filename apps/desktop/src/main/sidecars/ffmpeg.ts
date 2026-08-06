import { execFile, spawn as nodeSpawn } from "node:child_process";
import { promisify } from "node:util";
import type { ExecFn, SpawnFn } from "./ytdlp";

export class FfmpegNotInstalledError extends Error {
  constructor(message = "ffmpeg is not installed — install it in Settings → Binaries") {
    super(message);
    this.name = "FfmpegNotInstalledError";
  }
}

/** Args to transcode any media file to the 16 kHz mono PCM WAV whisper.cpp expects. */
export function buildWavArgs(inputPath: string, outputPath: string): string[] {
  return [
    "-i", inputPath, "-vn", "-ar", "16000", "-ac", "1",
    "-c:a", "pcm_s16le", "-y", "-loglevel", "error", outputPath,
  ];
}

/** Default scene-change sensitivity: lower keeps more frames (slide dissolves),
 * higher keeps only hard cuts. Tuned by a human pass on real videos. */
export const DEFAULT_SCENE_THRESHOLD = 0.4;

/**
 * Args to extract candidate "slide" frames: keep frames whose scene-change score
 * exceeds `sceneThreshold` (slide cuts), drop near-identical held frames with
 * `mpdecimate`, and `showinfo` so each surviving frame's `pts_time` is printed to
 * stderr. `-vsync vfr` writes only selected frames (no constant-rate duplication).
 * The single quotes are literal (no shell — execFile passes args verbatim); ffmpeg's
 * filtergraph parser needs them so the comma inside gt() isn't read as a filter break.
 * `-fps_mode vfr` (not the removed `-vsync vfr`) writes only selected frames — recent
 * ffmpeg builds dropped `-vsync` entirely ("Unrecognized option 'vsync'").
 */
/**
 * Args to SCAN for scene-change timestamps (no image output — `-f null`). showinfo prints a
 * `pts_time` for each frame whose scene-change score exceeds the threshold; the caller grabs
 * the actual frames a beat later (see FrameService), because the scene-change frame itself is
 * the transition/outgoing shot (a talking head), not the settled slide.
 */
export function buildSceneScanArgs(inputPath: string, sceneThreshold = DEFAULT_SCENE_THRESHOLD): string[] {
  return [
    "-i", inputPath,
    // Downscale before scene-detect — cut detection is robust at low res and much faster.
    "-vf", `scale=640:-2,select='gt(scene,${sceneThreshold})',showinfo`,
    "-fps_mode", "vfr", "-f", "null", "-",
  ];
}

/** A crop region as fractions (0..1) of the video frame. */
export interface FrameCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `crop=` filter expression in frame-relative terms (iw/ih), so no pixel dims are needed. */
function cropFilter(crop: FrameCrop): string {
  return `crop=iw*${crop.w}:ih*${crop.h}:iw*${crop.x}:ih*${crop.y}`;
}

/** How many seconds before the target to start decoding, for frame-accurate capture. */
const SEEK_PREROLL_SEC = 5;

/**
 * Args to grab the frame AT `seconds` (manual capture). Hybrid seek: `-ss` before `-i`
 * fast-seeks to a keyframe ~5s early, then `-ss` after `-i` decodes forward to the exact
 * frame. A single `-ss` before `-i` snaps to the previous keyframe (lands a few frames
 * early — the wrong moment), and a single `-ss` after `-i` decodes from 0 (slow on long
 * videos). The hybrid is both fast and frame-accurate.
 */
export function buildFrameAtArgs(
  inputPath: string,
  outputPath: string,
  seconds: number,
  crop?: FrameCrop,
): string[] {
  const pre = Math.max(0, seconds - SEEK_PREROLL_SEC);
  const post = seconds - pre;
  return [
    "-ss", String(pre), "-i", inputPath, "-ss", String(post),
    ...(crop ? ["-vf", cropFilter(crop)] : []),
    "-frames:v", "1", "-qscale:v", "3", "-y", "-loglevel", "error", outputPath,
  ];
}

const PTS_TIME_RE = /pts_time:(\d+(?:\.\d+)?)/g;

/** Pull each frame's source timestamp (seconds) from showinfo's stderr, in order. */
export function parseShowinfoTimestamps(stderr: string): number[] {
  return [...stderr.matchAll(PTS_TIME_RE)].map((m) => Number(m[1]));
}

const FFMPEG_TIME_RE = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/;

/** Current scan position (seconds) from an ffmpeg `-stats` status line, else null. */
export function parseFfmpegTime(line: string): number | null {
  const m = FFMPEG_TIME_RE.exec(line);
  if (!m) return null;
  const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return Number.isNaN(seconds) ? null : seconds;
}

export interface FfmpegRunner {
  extractWav(o: { inputPath: string; outputPath: string }): Promise<void>;
  /** Scans the whole video and returns the scene-change timestamps (seconds), in order. */
  detectSceneTimes(o: {
    inputPath: string;
    sceneThreshold?: number;
    /** Fires with the current scan position (seconds) as ffmpeg advances through the video. */
    onProgress?: (seconds: number) => void;
  }): Promise<number[]>;
  extractFrameAt(o: {
    inputPath: string;
    outputPath: string;
    seconds: number;
    crop?: FrameCrop;
  }): Promise<void>;
}

const execFileAsync = promisify(execFile);
const defaultExec: ExecFn = async (file, args) => {
  const { stdout, stderr } = await execFileAsync(file, args, {
    maxBuffer: 1024 * 1024 * 16,
    timeout: 300_000, // large media can take a while to transcode
    killSignal: "SIGKILL",
  });
  return { stdout: stdout.toString(), stderr: stderr.toString() };
};

const defaultSpawn: SpawnFn = (file, args) => nodeSpawn(file, args);

export function createFfmpegRunner(deps: {
  getBinaryPath: () => string | null;
  exec?: ExecFn;
  spawn?: SpawnFn;
}): FfmpegRunner {
  const exec = deps.exec ?? defaultExec;
  const spawnProcess = deps.spawn ?? defaultSpawn;
  return {
    async extractWav({ inputPath, outputPath }) {
      const path = deps.getBinaryPath();
      if (!path) throw new FfmpegNotInstalledError();
      await exec(path, buildWavArgs(inputPath, outputPath));
    },

    async extractFrameAt({ inputPath, outputPath, seconds, crop }) {
      const path = deps.getBinaryPath();
      if (!path) throw new FfmpegNotInstalledError();
      await exec(path, buildFrameAtArgs(inputPath, outputPath, seconds, crop));
    },

    // Streamed (not buffered exec) so the caller gets scan progress on a long video —
    // ffmpeg prints its running `time=` position to stderr, and showinfo's `pts_time`
    // lines (one per scene change) are collected from the same stream.
    detectSceneTimes({ inputPath, sceneThreshold = DEFAULT_SCENE_THRESHOLD, onProgress }) {
      const args = buildSceneScanArgs(inputPath, sceneThreshold);
      return new Promise<number[]>((resolve, reject) => {
        const path = deps.getBinaryPath();
        if (!path) {
          reject(new FfmpegNotInstalledError());
          return;
        }
        const proc = spawnProcess(path, args);
        let stderr = "";
        let buffer = "";
        proc.stdout.on("data", () => {}); // drain (nothing on stdout, but keep it flowing)
        proc.stderr.on("data", (chunk) => {
          const text = String(chunk);
          stderr += text;
          if (!onProgress) return;
          // ffmpeg status lines are \r-updated; split on either terminator.
          buffer += text;
          const lines = buffer.split(/[\r\n]+/);
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const seconds = parseFfmpegTime(line);
            if (seconds !== null) onProgress(seconds);
          }
        });
        proc.on("error", reject);
        proc.on("close", (code) => {
          if (code !== 0) {
            reject(new Error(`ffmpeg scene scan failed (exit code ${String(code)})`));
            return;
          }
          resolve(parseShowinfoTimestamps(stderr));
        });
      });
    },
  };
}
