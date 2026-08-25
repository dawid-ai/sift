import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// Node-loadable: no electron import, so it unit-tests under plain Node (like the other services).
// The sift-thumb:// protocol handler (index.ts) calls serveThumb() to turn a remote thumbnail
// URL into locally-cached bytes: downloaded once, then served from userData/thumbnails forever
// after. The URL itself is the cache key, so an unchanged avatar is never re-fetched (tab changes
// hit disk); a channel whose avatar changed gets a new URL → a new cache entry on next refresh.

// Only fetch YouTube's image CDNs — the protocol handler must not become a general fetch proxy
// for whatever URL a (hypothetically compromised) renderer passes it.
const ALLOWED_HOST = /(^|\.)(googleusercontent\.com|ggpht\.com|ytimg\.com)$/;

/** Largest single thumbnail worth caching. Avatars and posters are tens of kilobytes;
 * anything past this is not a thumbnail and is refused before it is written. */
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;

/** Ceiling for the whole cache directory. Past it, the least recently modified entries
 * are dropped down to `SWEEP_TARGET_BYTES`. A miss costs one re-download, so evicting
 * too eagerly is cheap and unbounded growth in %APPDATA% is not. */
const MAX_CACHE_BYTES = 256 * 1024 * 1024;
const SWEEP_TARGET_BYTES = Math.floor(MAX_CACHE_BYTES * 0.8);

/** How many writes between directory sweeps — a sweep stats every file, so it does not
 * belong on the hot path of a library scroll. */
const WRITES_PER_SWEEP = 50;

/** Network timeout for one thumbnail. A hung CDN connection must not hold a protocol
 * request (and the renderer's <img>) open indefinitely. */
const FETCH_TIMEOUT_MS = 10_000;

let writesSinceSweep = WRITES_PER_SWEEP; // sweep on the first write of the session

export interface ThumbCacheDeps {
  dir: string;
  fetchImpl?: typeof fetch;
}

/** Sniffs the image type from magic bytes (the cached file has no extension). */
function contentType(b: Buffer): string {
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49) return "image/gif";
  if (
    b.length > 12 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return "application/octet-stream";
}

/** Declared body size, or null when the server didn't say. */
function declaredLength(res: unknown): number | null {
  const headers = (res as { headers?: { get?: (n: string) => string | null } })
    .headers;
  const raw = headers?.get?.("content-length");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Drops the least recently modified entries until the directory is back under
 * `SWEEP_TARGET_BYTES`. Never throws: a cache that can't be pruned is a disk-space
 * problem, not a reason to fail the image request that triggered it.
 */
export function sweepThumbCache(
  dir: string,
  maxBytes = MAX_CACHE_BYTES,
  targetBytes = SWEEP_TARGET_BYTES,
): void {
  try {
    const entries = readdirSync(dir).flatMap((name) => {
      try {
        const s = statSync(join(dir, name));
        return s.isFile()
          ? [{ path: join(dir, name), size: s.size, mtime: s.mtimeMs }]
          : [];
      } catch {
        return [];
      }
    });
    let total = entries.reduce((sum, e) => sum + e.size, 0);
    if (total <= maxBytes) return;
    entries.sort((a, b) => a.mtime - b.mtime);
    for (const e of entries) {
      if (total <= targetBytes) break;
      try {
        rmSync(e.path, { force: true });
        total -= e.size;
      } catch {
        /* skip a file that's locked or already gone */
      }
    }
  } catch {
    /* unreadable cache dir — nothing to prune */
  }
}

/** Resolves a remote thumbnail URL to cached bytes, downloading + persisting on a cache miss.
 * Returns null for a disallowed host, non-2xx, oversized body, timeout, or network failure
 * (caller serves a 404). */
export async function serveThumb(
  deps: ThumbCacheDeps,
  rawUrl: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !ALLOWED_HOST.test(u.hostname)) return null;

  const file = join(deps.dir, createHash("sha1").update(rawUrl).digest("hex"));
  if (existsSync(file)) {
    const body = readFileSync(file);
    return { body, contentType: contentType(body) };
  }
  try {
    const res = await (deps.fetchImpl ?? fetch)(rawUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const declared = declaredLength(res);
    if (declared !== null && declared > MAX_ENTRY_BYTES) return null;
    const body = Buffer.from(await res.arrayBuffer());
    // Re-checked after reading: a server can lie about, or omit, content-length.
    if (body.byteLength > MAX_ENTRY_BYTES) return null;
    mkdirSync(deps.dir, { recursive: true });
    writeFileSync(file, body);
    if (++writesSinceSweep >= WRITES_PER_SWEEP) {
      writesSinceSweep = 0;
      sweepThumbCache(deps.dir);
    }
    return { body, contentType: contentType(body) };
  } catch {
    return null;
  }
}
