import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveThumb } from "./thumbnail-cache";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function fakeFetch(body: Buffer, ok = true): typeof fetch {
  return vi.fn(async () => ({
    ok,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  })) as unknown as typeof fetch;
}

describe("serveThumb", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "sift-thumb-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("rejects a non-allowlisted host without fetching", async () => {
    const f = fakeFetch(JPEG);
    expect(await serveThumb({ dir, fetchImpl: f }, "https://evil.example.com/x.jpg")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("rejects non-https", async () => {
    expect(await serveThumb({ dir, fetchImpl: fakeFetch(JPEG) }, "http://yt3.ggpht.com/x")).toBeNull();
  });

  it("rejects a malformed url", async () => {
    expect(await serveThumb({ dir, fetchImpl: fakeFetch(JPEG) }, "not a url")).toBeNull();
  });

  it("downloads on miss, caches to disk, and sniffs the jpeg type", async () => {
    const f = fakeFetch(JPEG);
    const r = await serveThumb({ dir, fetchImpl: f }, "https://yt3.googleusercontent.com/abc=s176");
    expect(r?.contentType).toBe("image/jpeg");
    expect(r?.body.equals(JPEG)).toBe(true);
    expect(readdirSync(dir)).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("serves from cache on a hit without re-fetching", async () => {
    const f = fakeFetch(JPEG);
    const url = "https://yt3.googleusercontent.com/abc=s176";
    await serveThumb({ dir, fetchImpl: f }, url);
    await serveThumb({ dir, fetchImpl: f }, url);
    expect(f).toHaveBeenCalledTimes(1); // second call hit the cached file
  });

  it("returns null on a non-2xx response", async () => {
    expect(await serveThumb({ dir, fetchImpl: fakeFetch(JPEG, false) }, "https://yt3.ggpht.com/x")).toBeNull();
  });
});
