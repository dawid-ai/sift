import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Note: deliberately does NOT import `electron` — `safeStorage` is injected via
// `SecretsDeps` so this module (and its Vitest suite) stay loadable under plain Node.
// Real wiring in `main/index.ts` passes `{ safeStorage, filePath: join(app.getPath("userData"), "secrets", "anthropic.key") }`.

/** A minimal seam over `electron.safeStorage` so the logic is Node-unit-testable with a fake. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface SecretsDeps {
  safeStorage: SafeStorageLike;
  /** Absolute path to the ciphertext blob (e.g. userData/secrets/anthropic.key). */
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

const defaultFs: NonNullable<SecretsDeps["fs"]> = {
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
};

/**
 * Encrypted-at-rest storage for the BYO Anthropic API key, backed by Electron's
 * `safeStorage`. SECURITY: if the OS-level encryption backend is unavailable,
 * `setKey` throws and writes nothing — it never falls back to plaintext.
 */
export function createSecrets(deps: SecretsDeps): {
  hasKey(): boolean;
  setKey(plain: string): void;
  getKey(): string | null;
  clearKey(): void;
} {
  const { safeStorage, filePath } = deps;
  const fs = deps.fs ?? defaultFs;

  return {
    hasKey(): boolean {
      return fs.existsSync(filePath);
    },

    setKey(plain: string): void {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
          "Secure storage is unavailable on this system — the API key was not saved.",
        );
      }
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, safeStorage.encryptString(plain));
    },

    getKey(): string | null {
      if (!fs.existsSync(filePath)) return null;
      try {
        return safeStorage.decryptString(fs.readFileSync(filePath));
      } catch {
        // A stored blob that can't be decrypted (corruption, OS reinstall,
        // DPAPI/Keychain scope change, synced userData from another machine) is
        // treated exactly like "no key configured" so app startup degrades
        // gracefully instead of crashing. The user simply re-enters the key.
        // NEVER log the ciphertext or any key material here.
        console.warn("Stored API key could not be decrypted; clearing is recommended.");
        return null;
      }
    },

    clearKey(): void {
      fs.rmSync(filePath, { force: true });
    },
  };
}
