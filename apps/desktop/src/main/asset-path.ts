import { isAbsolute, join, relative } from "node:path";
import type { AssetKind, SiftDatabase } from "@sift/db";

/** Resolve a stored asset path to absolute. Relative paths are joined onto
 *  binariesDir; already-absolute paths pass through unchanged (crash-safe if a
 *  row was never normalized). Never throws. */
export function resolveAssetPath(binariesDir: string, stored: string): string {
  return isAbsolute(stored) ? stored : join(binariesDir, stored);
}

/** One-time, idempotent hygiene: rewrite any absolute asset.path that lives
 *  under binariesDir to its binariesDir-relative form. Rows already relative,
 *  or absolute but outside binariesDir (e.g. a homebrew whisper-cli), are left
 *  untouched. NOT a schema migration — safe to run on every launch. */
export function normalizeAssetPaths(db: SiftDatabase, binariesDir: string): void {
  const rows = db.prepare<{ kind: AssetKind; path: string }>("SELECT kind, path FROM asset").all();
  const update = db.prepare("UPDATE asset SET path = ? WHERE kind = ?");
  for (const row of rows) {
    if (!isAbsolute(row.path)) continue;
    const rel = relative(binariesDir, row.path);
    // relative() yields a "..\\…" path when row.path is not under binariesDir.
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) continue;
    update.run(rel, row.kind);
  }
}
