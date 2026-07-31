import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExecFn } from "./ytdlp";

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

/** whisper.cpp `--output-json` shape: `{ transcription: [{ offsets: { from, to }, text }] }`
 * with offsets in milliseconds. Unknown/empty payloads yield no segments. */
export function parseWhisperJson(json: unknown): WhisperSegment[] {
  if (!json || typeof json !== "object") return [];
  const arr = (json as { transcription?: unknown }).transcription;
  if (!Array.isArray(arr)) return [];
  const out: WhisperSegment[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const off = (item as { offsets?: { from?: unknown; to?: unknown } }).offsets;
    const text = (item as { text?: unknown }).text;
    if (!off || typeof text !== "string") continue;
    const from = Number(off.from);
    const to = Number(off.to);
    if (Number.isNaN(from) || Number.isNaN(to)) continue;
    out.push({ start: from / 1000, end: to / 1000, text: text.trim() });
  }
  return out;
}

export interface WhisperRunner {
  transcribe(o: { wavPath: string; language: string }): Promise<{ segments: WhisperSegment[] }>;
}

const execFileAsync = promisify(execFile);
const defaultExec: ExecFn = async (file, args) => {
  const { stdout, stderr } = await execFileAsync(file, args, {
    maxBuffer: 1024 * 1024 * 64,
    timeout: 0, // whisper on a long file can run for minutes — no timeout
    killSignal: "SIGKILL",
  });
  return { stdout: stdout.toString(), stderr: stderr.toString() };
};

export function createWhisperRunner(deps: {
  getBinaryPath: () => string | null;
  getModelPath: () => string | null;
  exec?: ExecFn;
  readJson?: (path: string) => unknown;
}): WhisperRunner {
  const exec = deps.exec ?? defaultExec;
  const readJson = deps.readJson ?? ((p: string) => JSON.parse(readFileSync(p, "utf8")));
  return {
    async transcribe({ wavPath, language }) {
      const binary = deps.getBinaryPath();
      const model = deps.getModelPath();
      if (!binary) throw new Error("whisper is not installed — install it in Settings → Binaries");
      if (!model) throw new Error("whisper model is missing — install it in Settings → Binaries");

      const outBase = join(tmpdir(), `sift-whisper-${randomUUID()}`);
      const jsonPath = `${outBase}.json`;
      try {
        await exec(binary, [
          "-m", model,
          "-f", wavPath,
          "-l", language,
          "-oj",          // --output-json → writes <outBase>.json
          "-of", outBase, // --output-file base (no extension)
        ]);
        return { segments: parseWhisperJson(readJson(jsonPath)) };
      } finally {
        rmSync(jsonPath, { force: true });
      }
    },
  };
}
