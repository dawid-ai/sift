import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Node-loadable: no electron import, so it unit-tests under plain Node (like the other services).
// The sift-thumb:// protocol handler (index.ts) calls serveThumb() to turn a remote thumbnail
// URL into locally-cached bytes: downloaded once, then served from userData/thumbnails forever
// after. The URL itself is the cache key, so an unchanged avatar is never re-fetched (tab changes
// hit disk); a channel whose avatar changed gets a new URL → a new cache entry on next refresh.

// Only fetch YouTube's image CDNs — the protocol handler must not become a general fetch proxy
// for whatever URL a (hypothetically compromised) renderer passes it.
const ALLOWED_HOST = /(^|\.)(googleusercontent\.com|ggpht\.com|ytimg\.com)$/;

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

/** Resolves a remote thumbnail URL to cached bytes, downloading + persisting on a cache miss.
 * Returns null for a disallowed host, non-2xx, or network failure (caller serves a 404). */
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
    const res = await (deps.fetchImpl ?? fetch)(rawUrl);
    if (!res.ok) return null;
    const body = Buffer.from(await res.arrayBuffer());
    mkdirSync(deps.dir, { recursive: true });
    writeFileSync(file, body);
    return { body, contentType: contentType(body) };
  } catch {
    return null;
  }
}
