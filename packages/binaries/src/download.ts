import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, rename, unlink } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

export interface DownloadOpts {
  url: string;
  destPath: string;
  expectedSha256: string;
  onProgress?: (p: { received: number; total: number | null }) => void;
  fetchImpl?: typeof fetch;
}

/**
 * Stream `url` to `destPath`, hashing while writing. Aborts and deletes the temp
 * file on HTTP error or sha256 mismatch — never leaves an unverified binary at
 * `destPath`. On success, atomically renames into place and (non-Windows) chmods
 * the file executable.
 */
export async function downloadAndVerify(opts: DownloadOpts): Promise<void> {
  const doFetch = opts.fetchImpl ?? fetch;
  // Per-invocation unique temp name so concurrent downloads to the same dest
  // can't truncate or unlink each other's in-flight file.
  const tmp = `${opts.destPath}.${randomUUID()}.download`;
  const res = await doFetch(opts.url);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}) for ${opts.url}`);
  }
  const totalHeader = res.headers.get("content-length");
  const total = totalHeader === null ? null : Number(totalHeader);

  const hash = createHash("sha256");
  let received = 0;
  // Hash INSIDE the pipeline (a Transform) so the digested bytes are exactly the
  // bytes written to disk — correctness must not depend on event-loop timing.
  const hashAndCount = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk);
      received += chunk.length;
      opts.onProgress?.({ received, total });
      cb(null, chunk);
    },
  });
  // `res.body` is a DOM ReadableStream (lib.dom) which is nominally distinct from
  // node:stream/web's ReadableStream that Readable.fromWeb expects — hence the cast.
  const nodeStream = Readable.fromWeb(
    res.body as import("stream/web").ReadableStream,
  );
  try {
    await pipeline(nodeStream, hashAndCount, createWriteStream(tmp));
    const actual = hash.digest("hex");
    if (actual.toLowerCase() !== opts.expectedSha256.toLowerCase()) {
      throw new Error(
        `sha256 mismatch: expected ${opts.expectedSha256}, got ${actual}`,
      );
    }
    await rename(tmp, opts.destPath);
    if (process.platform !== "win32") await chmod(opts.destPath, 0o755);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}
