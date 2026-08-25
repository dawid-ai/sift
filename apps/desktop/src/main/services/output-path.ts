import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Node-loadable (no electron import), like the services that use it.

export interface OutputPathDeps {
  exists?: (path: string) => boolean;
  read?: (path: string) => Buffer;
}

function sameContent(
  path: string,
  content: string | Buffer,
  read: (p: string) => Buffer,
): boolean {
  try {
    const existing = read(path);
    const wanted = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content, "utf8");
    return existing.equals(wanted);
  } catch {
    return false;
  }
}

/**
 * Resolves the path to write an exported artifact to, without clobbering an earlier one.
 *
 * `<base>.<ext>` is used when it is free, or when the file already there holds exactly
 * the content about to be written — re-exporting the same summary or transcript stays
 * idempotent instead of piling up copies. Anything else gets the next free
 * `<base> (2).<ext>`, so a second summary from the same prompt, or a re-run that produced
 * different text, keeps the earlier file. Without this, every database record for a media
 * item pointed at the newest file on disk and the earlier exports were gone.
 */
export function resolveOutputPath(
  dir: string,
  base: string,
  ext: string,
  content: string | Buffer,
  deps: OutputPathDeps = {},
): string {
  const exists = deps.exists ?? existsSync;
  const read = deps.read ?? readFileSync;

  const first = join(dir, `${base}.${ext}`);
  if (!exists(first) || sameContent(first, content, read)) return first;

  for (let n = 2; n <= 999; n++) {
    const candidate = join(dir, `${base} (${n}).${ext}`);
    if (!exists(candidate) || sameContent(candidate, content, read))
      return candidate;
  }
  throw new Error(
    `Too many exports named "${base}.${ext}" — delete some before exporting again.`,
  );
}
