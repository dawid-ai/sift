import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { writeFileAtomicSync } from "../atomic-write";

// Whether to auto-fetch a transcript right after a video download completes. Default true
// (preserves the original always-transcribe behavior). No `electron` import — stays
// Node-loadable for Vitest, mirroring transcript-method-config.ts.
export interface AutoTranscriptConfigDeps {
  filePath: string;
  fs?: {
    existsSync(p: string): boolean;
    readFileSync(p: string): Buffer;
    writeFileSync(p: string, d: Buffer): void;
    rmSync(p: string, opts: { force: boolean }): void;
    mkdirSync(p: string, opts: { recursive: boolean }): void;
  };
}
const defaultFs: NonNullable<AutoTranscriptConfigDeps["fs"]> = {
  existsSync,
  readFileSync,
  writeFileSync: writeFileAtomicSync,
  rmSync,
  mkdirSync,
};

export function createAutoTranscriptStore(deps: AutoTranscriptConfigDeps): {
  get(): boolean;
  set(enabled: boolean): void;
} {
  const { filePath } = deps;
  const fs = deps.fs ?? defaultFs;
  return {
    get(): boolean {
      if (!fs.existsSync(filePath)) return true; // default on
      try {
        const parsed: unknown = JSON.parse(
          fs.readFileSync(filePath).toString("utf8"),
        );
        const e = (parsed as { enabled?: unknown } | null)?.enabled;
        return typeof e === "boolean" ? e : true;
      } catch {
        return true;
      }
    },
    set(enabled: boolean): void {
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        Buffer.from(JSON.stringify({ enabled }), "utf8"),
      );
    },
  };
}
