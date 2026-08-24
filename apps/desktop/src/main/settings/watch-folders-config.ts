import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { writeFileAtomicSync } from "../atomic-write";

// No `electron` import — stays Node-loadable for Vitest, like the other settings stores.

export interface WatchFoldersConfig {
  folders: string[];
  /** Absolute paths already imported, so a restart does not re-import a whole folder. */
  imported: string[];
}

const DEFAULT: WatchFoldersConfig = { folders: [], imported: [] };

/** Cap on the remembered-import list, so the file cannot grow without bound. */
const MAX_IMPORTED = 5000;

export interface WatchFoldersConfigDeps {
  filePath: string;
  fs?: {
    existsSync(p: string): boolean;
    readFileSync(p: string): Buffer;
    writeFileSync(p: string, d: Buffer): void;
    rmSync(p: string, opts: { force: boolean }): void;
    mkdirSync(p: string, opts: { recursive: boolean }): void;
  };
}

const defaultFs: NonNullable<WatchFoldersConfigDeps["fs"]> = {
  existsSync,
  readFileSync,
  writeFileSync: writeFileAtomicSync,
  rmSync,
  mkdirSync,
};

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];

export function createWatchFoldersStore(deps: WatchFoldersConfigDeps): {
  get(): WatchFoldersConfig;
  setFolders(folders: string[]): WatchFoldersConfig;
  markImported(path: string): void;
} {
  const { filePath } = deps;
  const fs = deps.fs ?? defaultFs;

  function read(): WatchFoldersConfig {
    if (!fs.existsSync(filePath)) return { folders: [], imported: [] };
    try {
      const parsed: unknown = JSON.parse(
        fs.readFileSync(filePath).toString("utf8"),
      );
      const o = (parsed ?? {}) as Record<string, unknown>;
      return { folders: strings(o.folders), imported: strings(o.imported) };
    } catch {
      return { ...DEFAULT };
    }
  }

  function write(config: WatchFoldersConfig): void {
    fs.mkdirSync(dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(JSON.stringify(config), "utf8"));
  }

  return {
    get: read,
    setFolders(folders: string[]): WatchFoldersConfig {
      // Deduplicated, because two identical entries would import each file twice on the
      // first scan of a session.
      const unique = [...new Set(folders.map((f) => f.trim()).filter(Boolean))];
      const next = { ...read(), folders: unique };
      write(next);
      return next;
    },
    markImported(path: string): void {
      const current = read();
      if (current.imported.includes(path)) return;
      // Oldest entries drop first: a path that fell off the list only matters if the file is
      // still sitting in the folder, and by then the user has had thousands of imports.
      const imported = [...current.imported, path].slice(-MAX_IMPORTED);
      write({ ...current, imported });
    },
  };
}
