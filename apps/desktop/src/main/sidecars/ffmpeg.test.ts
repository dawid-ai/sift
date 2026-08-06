import { describe, expect, it, vi } from "vitest";
import {
  buildFrameAtArgs,
  buildSceneScanArgs,
  buildWavArgs,
  createFfmpegRunner,
  FfmpegNotInstalledError,
  parseFfmpegTime,
  parseShowinfoTimestamps,
} from "./ffmpeg";
import type { SpawnFn } from "./ytdlp";

/** A fake ffmpeg process whose stderr/close can be driven by the test. */
function fakeProc() {
  const listeners: {
    stderr?: (c: string) => void;
    close?: (code: number | null) => void;
    error?: (e: Error) => void;
  } = {};
  const proc = {
    stdout: { on: () => {} },
    stderr: { on: (_ev: "data", cb: (c: string) => void) => { listeners.stderr = cb; } },
    on(ev: "close" | "error", cb: never) {
      if (ev === "close") listeners.close = cb as (code: number | null) => void;
      if (ev === "error") listeners.error = cb as (e: Error) => void;
    },
  };
  return { proc, listeners };
}

describe("buildWavArgs", () => {
  it("produces 16 kHz mono pcm_s16le with overwrite", () => {
    expect(buildWavArgs("/in.mp4", "/out.wav")).toEqual([
      "-i", "/in.mp4", "-vn", "-ar", "16000", "-ac", "1",
      "-c:a", "pcm_s16le", "-y", "-loglevel", "error", "/out.wav",
    ]);
  });
});

describe("buildFrameAtArgs", () => {
  it("hybrid-seeks (fast to ~5s before, then exact) to grab a single frame", () => {
    expect(buildFrameAtArgs("/in.mp4", "/out/manual.jpg", 12.5)).toEqual([
      "-ss", "7.5", "-i", "/in.mp4", "-ss", "5", "-frames:v", "1",
      "-qscale:v", "3", "-y", "-loglevel", "error", "/out/manual.jpg",
    ]);
  });
  it("clamps the pre-seek at 0 near the start of the video", () => {
    expect(buildFrameAtArgs("/in.mp4", "/o.jpg", 2)).toEqual([
      "-ss", "0", "-i", "/in.mp4", "-ss", "2", "-frames:v", "1",
      "-qscale:v", "3", "-y", "-loglevel", "error", "/o.jpg",
    ]);
  });
});

describe("buildSceneScanArgs", () => {
  it("scans for scene changes on a downscaled stream with no image output", () => {
    expect(buildSceneScanArgs("/in.mp4", 0.4)).toEqual([
      "-i", "/in.mp4",
      "-vf", "scale=640:-2,select='gt(scene,0.4)',showinfo",
      "-fps_mode", "vfr", "-f", "null", "-",
    ]);
  });
});

describe("crop", () => {
  it("adds -vf crop to a single-frame grab (after the hybrid seek)", () => {
    expect(buildFrameAtArgs("/in.mp4", "/o/m.jpg", 12, { x: 0, y: 0, w: 0.5, h: 0.5 })).toEqual([
      "-ss", "7", "-i", "/in.mp4", "-ss", "5", "-vf", "crop=iw*0.5:ih*0.5:iw*0:ih*0",
      "-frames:v", "1", "-qscale:v", "3", "-y", "-loglevel", "error", "/o/m.jpg",
    ]);
  });
});

describe("parseShowinfoTimestamps", () => {
  it("pulls pts_time (seconds) in order from showinfo stderr", () => {
    const stderr = [
      "[Parsed_showinfo_2 @ 0x1] n:   0 pts:    100 pts_time:4.166667 pos: 1",
      "[Parsed_showinfo_2 @ 0x1] n:   1 pts:    500 pts_time:20 pos: 2",
      "unrelated line without a timestamp",
      "[Parsed_showinfo_2 @ 0x1] n:   2 pts:  1000 pts_time:41.5 pos: 3",
    ].join("\n");
    expect(parseShowinfoTimestamps(stderr)).toEqual([4.166667, 20, 41.5]);
  });

  it("returns empty for stderr with no frames (non-slide video)", () => {
    expect(parseShowinfoTimestamps("no frames here")).toEqual([]);
  });
});

describe("parseFfmpegTime", () => {
  it("reads the scan position (seconds) from an ffmpeg status line", () => {
    expect(parseFfmpegTime("frame= 12 fps=0 q=3.0 size=N/A time=00:01:02.50 bitrate=N/A")).toBe(62.5);
  });
  it("returns null for a line without time=", () => {
    expect(parseFfmpegTime("[showinfo] pts_time:5")).toBeNull();
  });
});

describe("createFfmpegRunner", () => {
  it("throws when ffmpeg is not installed", async () => {
    const r = createFfmpegRunner({ getBinaryPath: () => null });
    await expect(r.extractWav({ inputPath: "/a", outputPath: "/b" })).rejects.toBeInstanceOf(
      FfmpegNotInstalledError,
    );
  });

  it("execs the installed binary with the WAV args", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const r = createFfmpegRunner({ getBinaryPath: () => "/bin/ffmpeg", exec });
    await r.extractWav({ inputPath: "/in.mp4", outputPath: "/out.wav" });
    expect(exec).toHaveBeenCalledWith("/bin/ffmpeg", buildWavArgs("/in.mp4", "/out.wav"));
  });

  it("detectSceneTimes spawns the scan, streams progress, and returns scene times", async () => {
    const { proc, listeners } = fakeProc();
    let spawnedArgs: string[] = [];
    const spawn: SpawnFn = (_file, args) => {
      spawnedArgs = args;
      return proc;
    };
    const r = createFfmpegRunner({ getBinaryPath: () => "/bin/ffmpeg", spawn });
    const seconds: number[] = [];
    const promise = r.detectSceneTimes({ inputPath: "/in.mp4", onProgress: (s) => seconds.push(s) });

    // ffmpeg streams status (time=) and showinfo (pts_time) on stderr, then exits 0.
    listeners.stderr?.("frame=1 time=00:00:04.00 bitrate=N/A\r");
    listeners.stderr?.("[showinfo] n:0 pts_time:16.9169 pos:1\n");
    listeners.stderr?.("frame=2 time=00:00:20.00 bitrate=N/A\r[showinfo] n:1 pts_time:63.1 pos:2\n");
    listeners.close?.(0);

    expect(spawnedArgs).toEqual(buildSceneScanArgs("/in.mp4", 0.4));
    expect(seconds).toEqual([4, 20]);
    await expect(promise).resolves.toEqual([16.9169, 63.1]);
  });

  it("detectSceneTimes rejects on a non-zero ffmpeg exit", async () => {
    const { proc, listeners } = fakeProc();
    const spawn: SpawnFn = () => proc;
    const r = createFfmpegRunner({ getBinaryPath: () => "/bin/ffmpeg", spawn });
    const promise = r.detectSceneTimes({ inputPath: "/in.mp4" });
    listeners.stderr?.("some ffmpeg error\n");
    listeners.close?.(1);
    await expect(promise).rejects.toThrow(/scene scan failed/);
  });

  it("detectSceneTimes throws when ffmpeg is not installed", async () => {
    const r = createFfmpegRunner({ getBinaryPath: () => null });
    await expect(r.detectSceneTimes({ inputPath: "/a" })).rejects.toBeInstanceOf(
      FfmpegNotInstalledError,
    );
  });
});
