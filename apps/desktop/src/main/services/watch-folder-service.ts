import {
  existsSync,
  readdirSync,
  statSync,
  watch,
  type FSWatcher,
} from "node:fs";
import { extname, join } from "node:path";
import { MEDIA_EXTENSIONS } from "@sift/core";

// No `electron` import — the scan and the debounce are unit-testable with an injected fs.

export interface WatchFolderDeps {
  /** Folders to watch, read per scan so adding one takes effect without a restart. */
  folders: () => string[];
  /** Imports one file. Rejecting is fine — the path is remembered as attempted either way. */
  importFile: (path: string) => Promise<void>;
  /** Paths already imported, so a restart does not re-import the whole folder. */
  seen: () => Set<string>;
  markSeen: (path: string) => void;
  fs?: {
    existsSync(p: string): boolean;
    readdirSync(p: string): string[];
    statSync(p: string): { size: number; isFile(): boolean };
  };
  /** Milliseconds to wait after a change before scanning. */
  debounceMs?: number;
  onError?: (message: string) => void;
}

const defaultFs: NonNullable<WatchFolderDeps["fs"]> = {
  existsSync,
  readdirSync: (p) => readdirSync(p),
  statSync,
};

function isMedia(path: string): boolean {
  const ext = extname(path).slice(1).toLowerCase();
  return (MEDIA_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Imports media files that appear in the watched folders.
 *
 * Non-recursive on purpose. A watch folder is a drop box, and recursing turns pointing it at
 * a home directory into a full-library import nobody asked for.
 */
export class WatchFolderService {
  private watchers: FSWatcher[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scanning = false;
  /** Size seen on the previous scan, per path, so a file still being copied is skipped. */
  private lastSize = new Map<string, number>();

  constructor(private readonly deps: WatchFolderDeps) {}

  private get fs() {
    return this.deps.fs ?? defaultFs;
  }

  /** (Re)attaches watchers to the configured folders and scans once immediately. */
  start(): void {
    this.stop();
    for (const folder of this.deps.folders()) {
      if (!this.fs.existsSync(folder)) continue;
      try {
        const watcher = watch(folder, { persistent: false }, () =>
          this.schedule(),
        );
        watcher.on("error", (err) =>
          this.deps.onError?.(`Watch folder ${folder}: ${String(err)}`),
        );
        this.watchers.push(watcher);
      } catch (err) {
        this.deps.onError?.(`Cannot watch ${folder}: ${String(err)}`);
      }
    }
    void this.scan();
  }

  stop(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Coalesces a burst of change events into one scan. */
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.scan();
    }, this.deps.debounceMs ?? 2000);
    this.timer.unref?.();
  }

  /**
   * Imports every new media file across the watched folders.
   *
   * A file whose size changed since the previous scan is skipped and picked up next time:
   * a large file being copied in is visible long before it is complete, and importing it
   * mid-copy produces a truncated import that looks like a corrupt download.
   */
  async scan(): Promise<string[]> {
    if (this.scanning) return [];
    this.scanning = true;
    const imported: string[] = [];
    try {
      const seen = this.deps.seen();
      for (const folder of this.deps.folders()) {
        if (!this.fs.existsSync(folder)) continue;
        let names: string[];
        try {
          names = this.fs.readdirSync(folder);
        } catch (err) {
          this.deps.onError?.(`Cannot read ${folder}: ${String(err)}`);
          continue;
        }
        for (const name of names) {
          const path = join(folder, name);
          if (seen.has(path) || !isMedia(path)) continue;

          let size: number;
          try {
            const stat = this.fs.statSync(path);
            if (!stat.isFile()) continue;
            size = stat.size;
          } catch {
            continue;
          }
          if (size === 0) continue;

          const previous = this.lastSize.get(path);
          if (previous !== size) {
            // First sighting, or still growing. Record and wait for the next scan.
            this.lastSize.set(path, size);
            continue;
          }

          // Marked before the import, not after: a file that makes the importer throw must
          // not be retried on every scan for the rest of the session.
          this.deps.markSeen(path);
          this.lastSize.delete(path);
          try {
            await this.deps.importFile(path);
            imported.push(path);
          } catch (err) {
            this.deps.onError?.(`Import failed for ${path}: ${String(err)}`);
          }
        }
      }
      return imported;
    } finally {
      this.scanning = false;
    }
  }
}
