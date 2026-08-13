import { spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpawnFn } from "./ytdlp";

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
  transcribe(
    o: { wavPath: string; language: string },
    /** 0..1 as whisper.cpp reports `progress = N%` on stderr. */
    onProgress?: (ratio: number) => void,
  ): Promise<{ segments: WhisperSegment[] }>;
}

const defaultSpawn: SpawnFn = (file, args) => nodeSpawn(file, args);

// whisper.cpp with `-pp` prints `whisper_print_progress_callback: progress =  40%` on stderr.
const PROGRESS_RE = /progress\s*=\s*(\d+)\s*%/;

export function createWhisperRunner(deps: {
  getBinaryPath: () => string | null;
  getModelPath: () => string | null;
  spawn?: SpawnFn;
  readJson?: (path: string) => unknown;
}): WhisperRunner {
  const spawn = deps.spawn ?? defaultSpawn;
  const readJson = deps.readJson ?? ((p: string) => JSON.parse(readFileSync(p, "utf8")));
  return {
    transcribe({ wavPath, language }, onProgress) {
      const binary = deps.getBinaryPath();
      const model = deps.getModelPath();
      if (!binary) throw new Error("whisper is not installed — install it in Settings → Transcription → Whisper");
      if (!model) throw new Error("whisper model is missing — install it in Settings → Transcription → Whisper");

      const outBase = join(tmpdir(), `sift-whisper-${randomUUID()}`);
      const jsonPath = `${outBase}.json`;
      return new Promise<{ segments: WhisperSegment[] }>((resolve, reject) => {
        const proc = spawn(binary, [
          "-m", model,
          "-f", wavPath,
          "-l", language,
          "-oj",          // --output-json → writes <outBase>.json
          "-pp",          // --print-progress → `progress = N%` on stderr
          "-of", outBase, // --output-file base (no extension)
        ]);
        let last = -1;
        proc.stdout.on("data", () => {}); // drain
        proc.stderr.on("data", (chunk) => {
          if (!onProgress) return;
          const m = PROGRESS_RE.exec(String(chunk));
          // whisper re-emits the same % across lines; only forward increases.
          if (m && Number(m[1]) !== last) {
            last = Number(m[1]);
            onProgress(last / 100);
          }
        });
        proc.on("error", reject);
        proc.on("close", (code) => {
          if (code !== 0) {
            rmSync(jsonPath, { force: true });
            reject(new Error(`whisper failed (exit code ${String(code)})`));
            return;
          }
          try {
            resolve({ segments: parseWhisperJson(readJson(jsonPath)) });
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          } finally {
            rmSync(jsonPath, { force: true });
          }
        });
      });
    },
  };
}
