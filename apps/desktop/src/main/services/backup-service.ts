import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import {
  getMediaById,
  listDownloadsByMediaId,
  listMedia,
  setDownloadStatus,
  type SiftDatabase,
} from "@sift/db";

// No `electron` import — dialogs live in `ipc/backup.ts`, so the copy and the scan are
// testable against a temp directory.

export interface BackupManifest {
  kind: "sift-backup";
  version: 1;
  createdAt: string;
  appVersion: string;
  /** File name of the database copy inside the backup folder. */
  databaseFile: string;
  /** Non-secret settings files copied alongside it, by file name. */
  settingsFiles: string[];
  counts: { media: number; downloads: number };
}

export const BACKUP_KIND = "sift-backup";
export const BACKUP_VERSION = 1;

export interface BackupServiceDeps {
  db: SiftDatabase;
  /** Absolute path of the live database file. */
  databaseFile: () => string;
  /** Directory holding the non-secret settings JSON files. */
  settingsDir: () => string;
  appVersion: () => string;
}

/** One media file the library expects to exist but cannot find. */
export interface MissingFile {
  mediaId: number;
  downloadId: number;
  title: string;
  path: string;
}

export interface VerifyResult {
  checked: number;
  missing: MissingFile[];
}

export interface RepairResult {
  /** Download rows moved off `done` because their file is gone. */
  marked: number;
  /** Rows whose file was found again under a new root. */
  relinked: number;
}

/**
 * Backup, restore, and a verify/repair scan for files the library has lost track of.
 *
 * The backup copies the database and the non-secret settings, not the media. Media is the
 * bulk of the bytes and is already on disk wherever the user chose to keep it; copying it
 * into a backup folder would double a library's footprint to protect the half that is
 * replaceable by re-downloading.
 */
export class BackupService {
  constructor(private readonly deps: BackupServiceDeps) {}

  /** Writes a backup folder. Returns its path. */
  backup(targetDir: string): { path: string; manifest: BackupManifest } {
    mkdirSync(targetDir, { recursive: true });

    const dbSource = this.deps.databaseFile();
    if (!existsSync(dbSource))
      throw new Error("The library database is not on disk yet.");
    const databaseFile = basename(dbSource);
    copyFileSync(dbSource, join(targetDir, databaseFile));

    const settingsFiles: string[] = [];
    const settingsDir = this.deps.settingsDir();
    if (existsSync(settingsDir)) {
      const outDir = join(targetDir, "settings");
      mkdirSync(outDir, { recursive: true });
      for (const name of this.listSettings(settingsDir)) {
        copyFileSync(join(settingsDir, name), join(outDir, name));
        settingsFiles.push(name);
      }
    }

    const media = listMedia(this.deps.db);
    const manifest: BackupManifest = {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      appVersion: this.deps.appVersion(),
      databaseFile,
      settingsFiles,
      counts: {
        media: media.length,
        downloads: media.reduce(
          (n, m) => n + listDownloadsByMediaId(this.deps.db, m.id).length,
          0,
        ),
      },
    };
    writeFileSync(
      join(targetDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    return { path: targetDir, manifest };
  }

  /** Non-secret settings only. The secrets directory is deliberately not backed up: those
   * blobs are encrypted for one machine and would not decrypt anywhere else. */
  private listSettings(dir: string): string[] {
    try {
      return readdirSync(dir).filter((n) => n.endsWith(".json"));
    } catch {
      return [];
    }
  }

  /** Reads and checks a backup folder's manifest without applying anything. */
  inspect(sourceDir: string): BackupManifest {
    const manifestPath = join(sourceDir, "manifest.json");
    if (!existsSync(manifestPath))
      throw new Error("That folder has no manifest.json — not a Sift backup.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      throw new Error("The backup's manifest.json is not valid JSON.");
    }
    const m = parsed as Partial<BackupManifest>;
    if (m.kind !== BACKUP_KIND) throw new Error("That is not a Sift backup.");
    if (m.version !== BACKUP_VERSION)
      throw new Error(
        `That backup is version ${String(m.version)}; this build restores version ${BACKUP_VERSION}.`,
      );
    if (typeof m.databaseFile !== "string" || !m.databaseFile)
      throw new Error("The backup's manifest names no database file.");
    if (!existsSync(join(sourceDir, m.databaseFile)))
      throw new Error(
        `The backup is missing its database file (${m.databaseFile}).`,
      );
    return m as BackupManifest;
  }

  /**
   * Stages a restore: copies the backup's database and settings next to the live ones, with
   * a `.restored` suffix.
   *
   * It does not overwrite the running library. The database is open and in use, and swapping
   * the file underneath it corrupts both. The caller tells the user to quit and swap, which
   * is a two-file rename they can undo — unlike an overwrite of the only copy.
   */
  stageRestore(
    sourceDir: string,
    liveDbPath: string,
  ): {
    manifest: BackupManifest;
    stagedDatabase: string;
    stagedSettings: string[];
  } {
    const manifest = this.inspect(sourceDir);
    const stagedDatabase = `${liveDbPath}.restored`;
    copyFileSync(join(sourceDir, manifest.databaseFile), stagedDatabase);

    const stagedSettings: string[] = [];
    const settingsDir = this.deps.settingsDir();
    mkdirSync(settingsDir, { recursive: true });
    for (const name of manifest.settingsFiles ?? []) {
      const from = join(sourceDir, "settings", name);
      if (!existsSync(from)) continue;
      const to = join(settingsDir, `${name}.restored`);
      copyFileSync(from, to);
      stagedSettings.push(to);
    }
    return { manifest, stagedDatabase, stagedSettings };
  }

  /** Every completed download whose file is no longer where the database says it is. */
  verify(fileExists: (p: string) => boolean = existsSync): VerifyResult {
    const missing: MissingFile[] = [];
    let checked = 0;
    for (const media of listMedia(this.deps.db)) {
      for (const download of listDownloadsByMediaId(this.deps.db, media.id)) {
        if (download.status !== "done" || !download.file_path) continue;
        checked++;
        if (!fileExists(download.file_path))
          missing.push({
            mediaId: media.id,
            downloadId: download.id,
            title: media.title,
            path: download.file_path,
          });
      }
    }
    return { checked, missing };
  }

  /**
   * Repairs what `verify` found.
   *
   * `searchDir` is optional and tried first: the common cause is a moved or renamed downloads
   * folder, where every file still exists under a different root. Only what is genuinely gone
   * is marked, and marking is the whole repair — the row is kept, because the media, its
   * transcripts and its summaries are still worth having without the video file.
   */
  repair(
    missing: MissingFile[],
    searchDir?: string,
    deps: {
      fileExists?: (p: string) => boolean;
    } = {},
  ): RepairResult {
    const fileExists = deps.fileExists ?? existsSync;
    let marked = 0;
    let relinked = 0;

    for (const item of missing) {
      const candidate = searchDir ? join(searchDir, basename(item.path)) : null;
      if (candidate && fileExists(candidate)) {
        setDownloadStatus(
          this.deps.db,
          item.downloadId,
          "done",
          candidate,
          null,
          null,
        );
        relinked++;
        continue;
      }
      // Not deleted: an "error" row still carries the format and the label, and the video can
      // be re-downloaded into it. Deleting would take the transcripts and summaries with it.
      setDownloadStatus(
        this.deps.db,
        item.downloadId,
        "error",
        null,
        null,
        "The file is no longer on disk.",
      );
      marked++;
    }

    // Media rows whose every download is now gone should stop claiming to be downloaded.
    for (const item of missing) {
      const media = getMediaById(this.deps.db, item.mediaId);
      if (!media) continue;
      const stillHave = listDownloadsByMediaId(this.deps.db, item.mediaId).some(
        (d) => d.status === "done" && d.file_path,
      );
      if (!stillHave)
        this.deps.db
          .prepare(
            "UPDATE media SET download_status = 'error', download_path = NULL WHERE id = ?",
          )
          .run(item.mediaId);
    }
    return { marked, relinked };
  }
}
