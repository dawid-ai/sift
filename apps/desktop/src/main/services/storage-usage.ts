import type { Dirent } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

// No `electron` import — the walk and the formatting stay unit-testable against a temp dir.

/** One line in the storage dashboard. */
export interface StorageEntry {
  key: string;
  label: string;
  /** What it is and what losing it costs — shown under the label. */
  description: string;
  bytes: number;
  /** Whether `clearStorage` will delete it. Only things that come back on their own. */
  clearable: boolean;
}

export interface StorageUsage {
  entries: StorageEntry[];
  totalBytes: number;
  /** Free space on the volume holding the downloads folder, or null if it can't be read. */
  freeBytes: number | null;
}

/**
 * Total bytes of every file under `path`, recursively. Missing directory reads as 0.
 *
 * Symlinks are counted by their own size, not their target's — following them could walk out
 * of the directory being measured, and could loop.
 */
export async function dirSize(path: string): Promise<number> {
  let total = 0;
  let items: Dirent[];
  try {
    items = await readdir(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const item of items) {
    const child = join(path, item.name);
    if (item.isDirectory()) {
      total += await dirSize(child);
    } else if (item.isFile()) {
      try {
        total += (await stat(child)).size;
      } catch {
        /* vanished mid-walk — a cache being evicted under us is normal */
      }
    }
  }
  return total;
}

/**
 * Deletes a directory's contents but keeps the directory itself, so the code that writes
 * into it doesn't need to re-create it. Returns the bytes freed.
 */
export async function clearDir(path: string): Promise<number> {
  const before = await dirSize(path);
  let items: Dirent[];
  try {
    items = await readdir(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const item of items) {
    await rm(join(path, item.name), { recursive: true, force: true });
  }
  return before;
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** Byte count as a short human string. Used in the confirm dialog, which main builds. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}
