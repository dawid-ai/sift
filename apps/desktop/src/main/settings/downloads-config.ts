import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { writeFileAtomicSync } from "../atomic-write";

// No `electron` import — stays Node-loadable for Vitest, mirroring transcript-config.ts.
export interface DownloadsConfigDeps {
  filePath: string;
  defaultDir: string;
  fs?: {
    existsSync(p: string): boolean;
    readFileSync(p: string): Buffer;
    writeFileSync(p: string, d: Buffer): void;
    rmSync(p: string, opts: { force: boolean }): void;
    mkdirSync(p: string, opts: { recursive: boolean }): void;
  };
}
const defaultFs: NonNullable<DownloadsConfigDeps["fs"]> = {
  existsSync,
  readFileSync,
  writeFileSync: writeFileAtomicSync,
  rmSync,
  mkdirSync,
};

export function createDownloadsConfigStore(deps: DownloadsConfigDeps): {
  get(): string;
  set(path: string): void;
} {
  const { filePath, defaultDir } = deps;
  const fs = deps.fs ?? defaultFs;
  return {
    get(): string {
      if (!fs.existsSync(filePath)) return defaultDir;
      try {
        const parsed: unknown = JSON.parse(
          fs.readFileSync(filePath).toString("utf8"),
        );
        const p = (parsed as { path?: unknown } | null)?.path;
        return typeof p === "string" && p.trim().length > 0 ? p : defaultDir;
      } catch {
        return defaultDir;
      }
    },
    set(path: string): void {
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(JSON.stringify({ path }), "utf8"));
    },
  };
}
