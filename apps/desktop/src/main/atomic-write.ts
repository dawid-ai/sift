import {
  closeSync,
  fsyncSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";

// No `electron` import — the config and secrets stores that use this stay Node-loadable
// for their Vitest suites.

/**
 * Writes `data` to `path` as one indivisible step: a temp file in the same directory is
 * written, flushed to disk, then renamed over the target.
 *
 * A plain `writeFileSync` truncates the real file first, so a crash or power loss between
 * truncate and write leaves an empty or half-written file. For the settings stores that
 * degrades to "setting lost"; for `secrets/*.key` it destroys an API key that only exists
 * there. Rename is atomic within a volume on both NTFS and POSIX filesystems, so a reader
 * always sees either the old file or the new one.
 *
 * ponytail: the containing directory is not fsynced — there is no portable way to do that
 * on Windows, and the rename ordering is what actually protects the contents.
 */
export function writeFileAtomicSync(path: string, data: Buffer | string): void {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    const fd = openSync(tmp, "w");
    try {
      writeFileSync(fd, data);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}
