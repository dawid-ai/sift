import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { writeFileAtomicSync } from "../atomic-write";
import type { QueueConfig } from "@sift/ipc-contract";

// No `electron` import — stays Node-loadable for Vitest, like the other settings stores.

const DEFAULT: QueueConfig = { concurrency: 1, startAt: null };

export interface QueueConfigDeps {
  filePath: string;
  fs?: {
    existsSync(p: string): boolean;
    readFileSync(p: string): Buffer;
    writeFileSync(p: string, d: Buffer): void;
    rmSync(p: string, opts: { force: boolean }): void;
    mkdirSync(p: string, opts: { recursive: boolean }): void;
  };
}

const defaultFs: NonNullable<QueueConfigDeps["fs"]> = {
  existsSync,
  readFileSync,
  writeFileSync: writeFileAtomicSync,
  rmSync,
  mkdirSync,
};

/** Clamps a stored value back into range: a hand-edited config must not start twelve
 * concurrent yt-dlp processes. */
function normalize(value: unknown): QueueConfig {
  const v = (value ?? {}) as Partial<QueueConfig>;
  const concurrency =
    typeof v.concurrency === "number" && Number.isFinite(v.concurrency)
      ? Math.min(Math.max(Math.trunc(v.concurrency), 1), 4)
      : DEFAULT.concurrency;
  const startAt =
    typeof v.startAt === "number" && Number.isFinite(v.startAt)
      ? v.startAt
      : null;
  return { concurrency, startAt };
}

/** Persisted queue behaviour: how many items run at once, and an optional scheduled start. */
export function createQueueConfigStore(deps: QueueConfigDeps): {
  get(): QueueConfig;
  set(config: QueueConfig): void;
} {
  const { filePath } = deps;
  const fs = deps.fs ?? defaultFs;
  return {
    get(): QueueConfig {
      if (!fs.existsSync(filePath)) return DEFAULT;
      try {
        return normalize(
          JSON.parse(fs.readFileSync(filePath).toString("utf8")),
        );
      } catch {
        console.warn("Stored queue config could not be parsed; using default.");
        return DEFAULT;
      }
    },
    set(config: QueueConfig): void {
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        Buffer.from(JSON.stringify(normalize(config)), "utf8"),
      );
    },
  };
}
