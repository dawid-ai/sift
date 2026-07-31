import { describe, expect, it, vi } from "vitest";
import { buildWavArgs, createFfmpegRunner, FfmpegNotInstalledError } from "./ffmpeg";

describe("buildWavArgs", () => {
  it("produces 16 kHz mono pcm_s16le with overwrite", () => {
    expect(buildWavArgs("/in.mp4", "/out.wav")).toEqual([
      "-i", "/in.mp4", "-vn", "-ar", "16000", "-ac", "1",
      "-c:a", "pcm_s16le", "-y", "-loglevel", "error", "/out.wav",
    ]);
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
});
