import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExecFn } from "./ytdlp";

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

export interface FfmpegRunner {
  extractWav(o: { inputPath: string; outputPath: string }): Promise<void>;
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

export function createFfmpegRunner(deps: {
  getBinaryPath: () => string | null;
  exec?: ExecFn;
}): FfmpegRunner {
  const exec = deps.exec ?? defaultExec;
  return {
    async extractWav({ inputPath, outputPath }) {
      const path = deps.getBinaryPath();
      if (!path) throw new FfmpegNotInstalledError();
      await exec(path, buildWavArgs(inputPath, outputPath));
    },
  };
}
