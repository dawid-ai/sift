import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// No `electron` import — stays Node-loadable for Vitest, mirroring downloads-config.ts.
export interface AiDefaultConfig {
  providerId: string;
  model: string;
}

export interface AiDefaultConfigDeps {
  filePath: string;
  fs?: {
    existsSync(p: string): boolean;
    readFileSync(p: string): Buffer;
    writeFileSync(p: string, d: Buffer): void;
    rmSync(p: string, opts: { force: boolean }): void;
    mkdirSync(p: string, opts: { recursive: boolean }): void;
  };
}
const defaultFs: NonNullable<AiDefaultConfigDeps["fs"]> = {
  existsSync, readFileSync, writeFileSync, rmSync, mkdirSync,
};

/** Persists the user's default AI provider + model (used to seed every provider picker).
 * `null` when unset or malformed — callers fall back to "first available". */
export function createAiDefaultConfigStore(
  deps: AiDefaultConfigDeps,
): { get(): AiDefaultConfig | null; set(cfg: AiDefaultConfig | null): void } {
  const { filePath } = deps;
  const fs = deps.fs ?? defaultFs;
  return {
    get(): AiDefaultConfig | null {
      if (!fs.existsSync(filePath)) return null;
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath).toString("utf8")) as Partial<AiDefaultConfig> | null;
        if (parsed && typeof parsed.providerId === "string" && typeof parsed.model === "string") {
          return { providerId: parsed.providerId, model: parsed.model };
        }
        return null;
      } catch {
        return null;
      }
    },
    set(cfg: AiDefaultConfig | null): void {
      if (!cfg) {
        fs.rmSync(filePath, { force: true });
        return;
      }
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(JSON.stringify(cfg), "utf8"));
    },
  };
}
