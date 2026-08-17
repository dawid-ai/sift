import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

// No `electron` import — stays Node-loadable for Vitest, mirroring downloads-config.ts.
export type BinaryUpdatePolicy = "auto" | "notify";

export interface BinaryUpdatesConfigDeps {
  filePath: string;
  fs?: {
    existsSync(p: string): boolean;
    readFileSync(p: string): Buffer;
    writeFileSync(p: string, d: Buffer): void;
    rmSync(p: string, opts: { force: boolean }): void;
    mkdirSync(p: string, opts: { recursive: boolean }): void;
  };
}
const defaultFs: NonNullable<BinaryUpdatesConfigDeps["fs"]> = {
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
};

export function createBinaryUpdatesConfigStore(deps: BinaryUpdatesConfigDeps): {
  get(): BinaryUpdatePolicy;
  set(mode: BinaryUpdatePolicy): void;
} {
  const { filePath } = deps;
  const fs = deps.fs ?? defaultFs;
  return {
    get(): BinaryUpdatePolicy {
      if (!fs.existsSync(filePath)) return "auto";
      try {
        const parsed: unknown = JSON.parse(
          fs.readFileSync(filePath).toString("utf8"),
        );
        const m = (parsed as { mode?: unknown } | null)?.mode;
        return m === "notify" ? "notify" : "auto";
      } catch {
        return "auto";
      }
    },
    set(mode: BinaryUpdatePolicy): void {
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(JSON.stringify({ mode }), "utf8"));
    },
  };
}
