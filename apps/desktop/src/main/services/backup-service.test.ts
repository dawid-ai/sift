import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openTestDatabase } from "@sift/db/testing";
import {
  getMediaById,
  insertDownload,
  insertMedia,
  listDownloadsByMediaId,
  runMigrations,
  type SiftDatabase,
} from "@sift/db";
import { BackupService, BACKUP_KIND } from "./backup-service";

let db: SiftDatabase;
let root: string;
let dbFile: string;
let settingsDir: string;

function seed(
  filePath: string | null,
  status = "done",
): { media: number; download: number } {
  const media = insertMedia(db, {
    source_url: `https://y/${Math.random()}`,
    platform_id: "youtube",
    external_id: "abc",
    title: "A Talk",
    uploader: "Chan",
    uploader_url: null,
    duration_s: 100,
    thumbnail_path: null,
    view_count: null,
    like_count: null,
    published_at: null,
    metadata_json: "{}",
    download_status: status,
  });
  const download = insertDownload(db, {
    media_id: media.id,
    format_id: "1080p",
    label: "1080p",
    ext: "mp4",
    height: 1080,
    file_path: filePath,
    file_size: 10,
    status,
    error: null,
  });
  return { media: media.id, download: download.id };
}

function service() {
  return new BackupService({
    db,
    databaseFile: () => dbFile,
    settingsDir: () => settingsDir,
    appVersion: () => "1.2.3",
  });
}

beforeEach(async () => {
  db = await openTestDatabase();
  runMigrations(db);
  root = mkdtempSync(join(tmpdir(), "sift-backup-"));
  dbFile = join(root, "sift.db");
  writeFileSync(dbFile, "fake database bytes");
  settingsDir = join(root, "settings");
  mkdirSync(settingsDir, { recursive: true });
  writeFileSync(join(settingsDir, "queue.json"), '{"concurrency":2}');
  writeFileSync(join(settingsDir, "notes.txt"), "not a setting");
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("backup", () => {
  it("copies the database, the JSON settings, and writes a manifest", () => {
    seed(join(root, "media.mp4"));
    const target = join(root, "backup");
    const { manifest } = service().backup(target);

    expect(readFileSync(join(target, "sift.db"), "utf8")).toBe(
      "fake database bytes",
    );
    expect(existsSync(join(target, "settings", "queue.json"))).toBe(true);
    // Only JSON — a stray file in the settings folder is not a setting.
    expect(existsSync(join(target, "settings", "notes.txt"))).toBe(false);
    expect(manifest.kind).toBe(BACKUP_KIND);
    expect(manifest.appVersion).toBe("1.2.3");
    expect(manifest.counts).toEqual({ media: 1, downloads: 1 });
  });

  it("does not copy media files — those are the bulk and are replaceable", () => {
    const mediaPath = join(root, "media.mp4");
    writeFileSync(mediaPath, "video bytes");
    seed(mediaPath);
    const target = join(root, "backup");
    service().backup(target);
    expect(existsSync(join(target, "media.mp4"))).toBe(false);
  });

  it("refuses when there is no database yet", () => {
    rmSync(dbFile);
    expect(() => service().backup(join(root, "backup"))).toThrow(/not on disk/);
  });
});

describe("inspect", () => {
  it("accepts a backup this build wrote", () => {
    const target = join(root, "backup");
    service().backup(target);
    expect(service().inspect(target).kind).toBe(BACKUP_KIND);
  });

  it("rejects a folder that is not a backup", () => {
    expect(() => service().inspect(root)).toThrow(/not a Sift backup/);
  });

  it("rejects a corrupt or foreign manifest", () => {
    const target = join(root, "b2");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "manifest.json"), "{not json");
    expect(() => service().inspect(target)).toThrow(/not valid JSON/);

    writeFileSync(join(target, "manifest.json"), '{"kind":"other"}');
    expect(() => service().inspect(target)).toThrow(/not a Sift backup/);

    writeFileSync(
      join(target, "manifest.json"),
      JSON.stringify({ kind: BACKUP_KIND, version: 99 }),
    );
    expect(() => service().inspect(target)).toThrow(/version 99/);
  });

  it("rejects a backup whose database file is missing", () => {
    const target = join(root, "backup");
    service().backup(target);
    rmSync(join(target, "sift.db"));
    expect(() => service().inspect(target)).toThrow(/missing its database/);
  });
});

describe("stageRestore", () => {
  it("stages beside the live files instead of overwriting them", () => {
    const target = join(root, "backup");
    service().backup(target);
    writeFileSync(dbFile, "LIVE database");

    const result = service().stageRestore(target, dbFile);
    expect(result.stagedDatabase).toBe(`${dbFile}.restored`);
    expect(readFileSync(result.stagedDatabase, "utf8")).toBe(
      "fake database bytes",
    );
    // The running library is untouched — swapping an open database corrupts both copies.
    expect(readFileSync(dbFile, "utf8")).toBe("LIVE database");
    expect(result.stagedSettings[0]).toContain("queue.json.restored");
  });

  it("skips a settings file the manifest names but the folder lacks", () => {
    const target = join(root, "backup");
    service().backup(target);
    rmSync(join(target, "settings", "queue.json"));
    expect(service().stageRestore(target, dbFile).stagedSettings).toEqual([]);
  });
});

describe("verify", () => {
  it("reports completed downloads whose file has gone", () => {
    const present = join(root, "here.mp4");
    writeFileSync(present, "x");
    seed(present);
    const gone = seed(join(root, "gone.mp4"));

    const result = service().verify();
    expect(result.checked).toBe(2);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]?.downloadId).toBe(gone.download);
  });

  it("ignores rows that never completed", () => {
    seed(null, "error");
    expect(service().verify()).toEqual({ checked: 0, missing: [] });
  });
});

describe("repair", () => {
  it("relinks a file found under a new root", () => {
    const moved = join(root, "moved");
    mkdirSync(moved, { recursive: true });
    writeFileSync(join(moved, "talk.mp4"), "x");
    const ids = seed(join(root, "old", "talk.mp4"));

    const { missing } = service().verify();
    expect(service().repair(missing, moved)).toEqual({
      marked: 0,
      relinked: 1,
    });
    const download = listDownloadsByMediaId(db, ids.media)[0];
    expect(download?.status).toBe("done");
    expect(download?.file_path).toBe(join(moved, "talk.mp4"));
  });

  it("marks what is genuinely gone, keeping the row", () => {
    const ids = seed(join(root, "gone.mp4"));
    const { missing } = service().verify();
    expect(service().repair(missing)).toEqual({ marked: 1, relinked: 0 });

    const download = listDownloadsByMediaId(db, ids.media)[0];
    // Kept, not deleted: the transcripts and summaries hang off this media row.
    expect(download).toBeDefined();
    expect(download?.status).toBe("error");
    expect(download?.file_path).toBeNull();
    expect(getMediaById(db, ids.media)?.download_status).toBe("error");
  });

  it("leaves the media alone when another format is still on disk", () => {
    const present = join(root, "audio.m4a");
    writeFileSync(present, "x");
    const ids = seed(join(root, "video.mp4"));
    insertDownload(db, {
      media_id: ids.media,
      format_id: "audio",
      label: "Audio",
      ext: "m4a",
      height: null,
      file_path: present,
      file_size: 1,
      status: "done",
      error: null,
    });

    const { missing } = service().verify();
    service().repair(missing);
    expect(getMediaById(db, ids.media)?.download_status).not.toBe("error");
  });

  it("is a no-op on an empty list", () => {
    expect(service().repair([])).toEqual({ marked: 0, relinked: 0 });
  });
});
