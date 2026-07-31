import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

// Note: deliberately does NOT import `electron` — this module (and its Vitest suite) stay
// loadable under plain Node, mirroring `secrets.ts`'s injectable-fs style.
// Real wiring in `main/index.ts` passes `{ filePath: customConfigFile() }` (see `paths.ts`).

/** The custom (OpenAI-compatible) provider's NON-SECRET config: one base_url + one model. */
export interface CustomConfig {
  baseUrl: string;
  model: string;
}

export interface CustomConfigDeps {
  /** Absolute path to the plaintext JSON blob (e.g. userData/secrets/custom-config.json). */
  filePath: string;
  /** Injectable for tests; defaults to `node:fs`. */
  fs?: {
    existsSync(p: string): boolean;
    readFileSync(p: string): Buffer;
    writeFileSync(p: string, data: Buffer): void;
    rmSync(p: string, opts: { force: boolean }): void;
    mkdirSync(p: string, opts: { recursive: boolean }): void;
  };
}

const defaultFs: NonNullable<CustomConfigDeps["fs"]> = {
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
};

/** True if `value` is a plain object with string `baseUrl` and `model` fields. */
function isCustomConfig(value: unknown): value is CustomConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).baseUrl === "string" &&
    typeof (value as Record<string, unknown>).model === "string"
  );
}

/**
 * Plaintext JSON store for the custom provider's non-secret config (base_url + model).
 * The API key itself is NEVER stored here — it stays encrypted-at-rest via
 * `createSecrets`/`safeStorage` (see `secretsFile("custom")`); this store holds only the
 * two fields needed alongside that key to build the provider.
 */
export function createCustomConfigStore(deps: CustomConfigDeps): {
  get(): CustomConfig | null;
  set(cfg: CustomConfig): void;
  clear(): void;
} {
  const { filePath } = deps;
  const fs = deps.fs ?? defaultFs;

  return {
    get(): CustomConfig | null {
      if (!fs.existsSync(filePath)) return null;
      try {
        const parsed: unknown = JSON.parse(
          fs.readFileSync(filePath).toString("utf8"),
        );
        if (!isCustomConfig(parsed)) return null;
        return { baseUrl: parsed.baseUrl, model: parsed.model };
      } catch {
        // A stored file that isn't valid JSON (corruption, partial write) is treated
        // exactly like "no config configured" so app startup degrades gracefully
        // instead of crashing. The user simply re-enters base_url/model.
        console.warn(
          "Stored custom provider config could not be parsed; clearing is recommended.",
        );
        return null;
      }
    },

    set(cfg: CustomConfig): void {
      fs.mkdirSync(dirname(filePath), { recursive: true });
      // Reconstruct explicitly (mirror get()) so only baseUrl+model are ever written —
      // a defensive guard so a future caller can't leak a key into this non-secret store.
      const safe = { baseUrl: cfg.baseUrl, model: cfg.model };
      fs.writeFileSync(filePath, Buffer.from(JSON.stringify(safe), "utf8"));
    },

    clear(): void {
      fs.rmSync(filePath, { force: true });
    },
  };
}
