import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { writeFileAtomicSync } from "../atomic-write";
import type { TranscriptMethod } from "@sift/ipc-contract";

const VALID: TranscriptMethod[] = ["auto", "prefer_whisper", "captions_only"];

// No `electron` import — stays Node-loadable for Vitest, mirroring downloads-config.ts.
export interface TranscriptMethodConfigDeps {
  filePath: string;
  fs?: {
    existsSync(p: string): boolean;
    readFileSync(p: string): Buffer;
    writeFileSync(p: string, d: Buffer): void;
    rmSync(p: string, opts: { force: boolean }): void;
    mkdirSync(p: string, opts: { recursive: boolean }): void;
  };
}
const defaultFs: NonNullable<TranscriptMethodConfigDeps["fs"]> = {
  existsSync,
  readFileSync,
  writeFileSync: writeFileAtomicSync,
  rmSync,
  mkdirSync,
};

export function createTranscriptMethodStore(deps: TranscriptMethodConfigDeps): {
  get(): TranscriptMethod;
  set(m: TranscriptMethod): void;
} {
  const { filePath } = deps;
  const fs = deps.fs ?? defaultFs;
  return {
    get(): TranscriptMethod {
      if (!fs.existsSync(filePath)) return "auto";
      try {
        const parsed: unknown = JSON.parse(
          fs.readFileSync(filePath).toString("utf8"),
        );
        const m = (parsed as { method?: unknown } | null)?.method;
        return typeof m === "string" && VALID.includes(m as TranscriptMethod)
          ? (m as TranscriptMethod)
          : "auto";
      } catch {
        return "auto";
      }
    },
    set(m: TranscriptMethod): void {
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        Buffer.from(JSON.stringify({ method: m }), "utf8"),
      );
    },
  };
}
