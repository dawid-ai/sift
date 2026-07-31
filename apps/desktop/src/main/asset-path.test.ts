import { describe, expect, it } from "vitest";
import { openTestDatabase } from "@sift/db/testing";
import { runMigrations } from "@sift/db";
import { normalizeAssetPaths, resolveAssetPath } from "./asset-path";

const BASE = "C:\\Users\\me\\AppData\\Roaming\\Sift\\binaries";

async function makeTestDb() {
  const db = await openTestDatabase();
  runMigrations(db);
  return db;
}

describe("resolveAssetPath", () => {
  it("joins a relative stored path onto binariesDir", () => {
    expect(resolveAssetPath(BASE, "yt-dlp.exe")).toBe(`${BASE}\\yt-dlp.exe`);
  });
  it("joins a nested relative path (whisper)", () => {
    expect(resolveAssetPath(BASE, "whisper\\whisper-cli")).toBe(`${BASE}\\whisper\\whisper-cli`);
  });
  it("passes an already-absolute path through unchanged", () => {
    const abs = "D:\\somewhere\\else\\ffmpeg.exe";
    expect(resolveAssetPath(BASE, abs)).toBe(abs);
  });
});

describe("normalizeAssetPaths", () => {
  async function seedDb(rows: { kind: string; path: string }[]) {
    const db = await makeTestDb();
    for (const r of rows) {
      db.prepare(
        `INSERT INTO asset (kind, name, version, path, sha256, installed_at, last_checked)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(r.kind, r.kind, "1", r.path, "x", 0, 0);
    }
    return db;
  }

  it("rewrites an absolute-under-binariesDir row to relative", async () => {
    const db = await seedDb([{ kind: "ytdlp", path: `${BASE}\\yt-dlp.exe` }]);
    normalizeAssetPaths(db, BASE);
    expect(db.prepare<{ path: string }>("SELECT path FROM asset WHERE kind='ytdlp'").get()!.path)
      .toBe("yt-dlp.exe");
  });
  it("rewrites a nested absolute path to nested relative", async () => {
    const db = await seedDb([{ kind: "whisper", path: `${BASE}\\whisper\\whisper-cli` }]);
    normalizeAssetPaths(db, BASE);
    expect(db.prepare<{ path: string }>("SELECT path FROM asset WHERE kind='whisper'").get()!.path)
      .toBe("whisper\\whisper-cli");
  });
  it("leaves an already-relative row untouched (idempotent)", async () => {
    const db = await seedDb([{ kind: "ffmpeg", path: "ffmpeg.exe" }]);
    normalizeAssetPaths(db, BASE);
    normalizeAssetPaths(db, BASE);
    expect(db.prepare<{ path: string }>("SELECT path FROM asset WHERE kind='ffmpeg'").get()!.path)
      .toBe("ffmpeg.exe");
  });
  it("leaves an absolute path OUTSIDE binariesDir untouched (e.g. homebrew)", async () => {
    const db = await seedDb([{ kind: "whisper", path: "/opt/homebrew/bin/whisper-cli" }]);
    normalizeAssetPaths(db, BASE);
    expect(db.prepare<{ path: string }>("SELECT path FROM asset WHERE kind='whisper'").get()!.path)
      .toBe("/opt/homebrew/bin/whisper-cli");
  });
});
