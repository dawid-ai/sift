import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadAndVerify } from "./download";

const bytes = Buffer.from("fake-binary-contents");
const goodSha = createHash("sha256").update(bytes).digest("hex");
let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function fakeFetch(): typeof fetch {
  return (async () =>
    new Response(bytes, {
      status: 200,
      headers: { "content-length": String(bytes.length) },
    })) as unknown as typeof fetch;
}

describe("downloadAndVerify", () => {
  it("writes the file when the sha256 matches", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dl-"));
    const dest = join(dir, "yt-dlp");
    await downloadAndVerify({
      url: "https://x/y",
      destPath: dest,
      expectedSha256: goodSha,
      fetchImpl: fakeFetch(),
    });
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest).equals(bytes)).toBe(true);
  });

  it("throws and leaves no file when the sha256 mismatches", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dl-"));
    const dest = join(dir, "yt-dlp");
    await expect(
      downloadAndVerify({
        url: "https://x/y",
        destPath: dest,
        expectedSha256: "deadbeef",
        fetchImpl: fakeFetch(),
      }),
    ).rejects.toThrow(/sha256/i);
    expect(existsSync(dest)).toBe(false);
    expect(readdirSync(dir)).toHaveLength(0); // temp file cleaned up
  });

  it("throws and writes nothing on an HTTP error response", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dl-"));
    const dest = join(dir, "yt-dlp");
    const notFound = (async () =>
      new Response("nope", { status: 404 })) as unknown as typeof fetch;
    await expect(
      downloadAndVerify({
        url: "https://x/y",
        destPath: dest,
        expectedSha256: goodSha,
        fetchImpl: notFound,
      }),
    ).rejects.toThrow(/404/);
    expect(existsSync(dest)).toBe(false);
    expect(readdirSync(dir)).toHaveLength(0); // nothing written at all
  });
});
