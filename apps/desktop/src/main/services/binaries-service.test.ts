import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openTestDatabase } from "@sift/db/testing";
import { getAsset, runMigrations } from "@sift/db";
import type { BinarySource, ResolvedRelease } from "@sift/binaries";
import { BinariesService } from "./binaries-service";

const bytes = Buffer.from("fake-yt-dlp-binary-contents");
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

/** A fake plain-binary source (no archive extension) whose version can be bumped mid-test. */
function makeFakeSource(): {
  source: BinarySource;
  setVersion: (v: string) => void;
} {
  let version = "1.0.0";
  const source: BinarySource = {
    kind: "ytdlp",
    async resolveLatest(): Promise<ResolvedRelease> {
      return {
        version,
        assetUrl: "https://x/yt-dlp",
        sha256: goodSha,
        binaryName: "yt-dlp",
      };
    },
  };
  return { source, setVersion: (v: string) => (version = v) };
}

describe("BinariesService", () => {
  it("install() downloads, verifies, and persists an asset row", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-binsvc-"));
    const binDir = join(dir, "binaries");
    const db = await openTestDatabase();
    runMigrations(db);
    const { source } = makeFakeSource();

    const service = new BinariesService({
      db,
      binariesDir: binDir,
      sources: { ytdlp: source, ffmpeg: source, deno: source },
      platform: "win-x64",
      fetchImpl: fakeFetch(),
    });

    const status = await service.install("ytdlp");

    expect(status.installed).toBe(true);
    expect(status.installedVersion).toBe("1.0.0");
    const destPath = join(binDir, "yt-dlp");
    expect(existsSync(destPath)).toBe(true);
    expect(readFileSync(destPath).equals(bytes)).toBe(true);
    const row = getAsset(db, "ytdlp");
    expect(row?.path).toBe("yt-dlp"); // relative to binariesDir, not join(binDir, "yt-dlp")

    db.close();
  });

  it("check() reports no update available when versions match, then flags one after a bump", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-binsvc-"));
    const binDir = join(dir, "binaries");
    const db = await openTestDatabase();
    runMigrations(db);
    const { source, setVersion } = makeFakeSource();

    const service = new BinariesService({
      db,
      binariesDir: binDir,
      sources: { ytdlp: source, ffmpeg: source, deno: source },
      platform: "win-x64",
      fetchImpl: fakeFetch(),
    });

    await service.install("ytdlp");

    const same = await service.check("ytdlp");
    expect(same.updateAvailable).toBe(false);
    expect(same.latestVersion).toBe("1.0.0");

    setVersion("2.0.0");
    const bumped = await service.check("ytdlp");
    expect(bumped.updateAvailable).toBe(true);
    expect(bumped.latestVersion).toBe("2.0.0");
    expect(bumped.installedVersion).toBe("1.0.0");

    db.close();
  });

  it("check() reports not installed and no update available for a never-installed binary", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-binsvc-"));
    const binDir = join(dir, "binaries");
    const db = await openTestDatabase();
    runMigrations(db);
    const { source } = makeFakeSource();

    const service = new BinariesService({
      db,
      binariesDir: binDir,
      sources: { ytdlp: source, ffmpeg: source, deno: source },
      platform: "win-x64",
      fetchImpl: fakeFetch(),
    });

    // Note: ffmpeg is never installed in this test — only the source's resolveLatest
    // is exercised via check().
    const status = await service.check("ffmpeg");

    expect(status.installed).toBe(false);
    expect(status.installedVersion).toBeNull();
    expect(status.updateAvailable).toBe(false);
    expect(status.latestVersion).toBe("1.0.0");

    db.close();
  });

  it("list() reports all kinds, only ytdlp installed", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-binsvc-"));
    const binDir = join(dir, "binaries");
    const db = await openTestDatabase();
    runMigrations(db);
    const { source } = makeFakeSource();

    const service = new BinariesService({
      db,
      binariesDir: binDir,
      sources: { ytdlp: source, ffmpeg: source, deno: source },
      platform: "win-x64",
      fetchImpl: fakeFetch(),
    });

    await service.install("ytdlp");

    const statuses = await service.list();
    expect(statuses).toHaveLength(3);
    const ytdlp = statuses.find((s) => s.kind === "ytdlp");
    const ffmpeg = statuses.find((s) => s.kind === "ffmpeg");
    const deno = statuses.find((s) => s.kind === "deno");
    expect(ytdlp?.installed).toBe(true);
    expect(ffmpeg?.installed).toBe(false);
    expect(deno?.installed).toBe(false);

    db.close();
  });

  it("list() reports the resolved absolute path for an installed binary", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-binsvc-"));
    const binDir = join(dir, "binaries");
    const db = await openTestDatabase();
    runMigrations(db);
    const { source } = makeFakeSource();

    const service = new BinariesService({
      db,
      binariesDir: binDir,
      sources: { ytdlp: source, ffmpeg: source, deno: source },
      platform: "win-x64",
      fetchImpl: fakeFetch(),
    });

    await service.install("ytdlp");

    // The stored row.path is relative ("yt-dlp"); list() must resolve it against
    // binariesDir before handing it back for UI display.
    const row = getAsset(db, "ytdlp");
    expect(row?.path).toBe("yt-dlp");

    const status = (await service.list()).find((s) => s.kind === "ytdlp");
    expect(status?.path).toBe(join(binDir, "yt-dlp"));

    db.close();
  });
});
