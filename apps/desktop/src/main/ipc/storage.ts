import { statSync } from "node:fs";
import { dialog, ipcMain, type BrowserWindow } from "electron";
import { IPC } from "@sift/ipc-contract";
import type { SiftDatabase } from "@sift/db";
import {
  clearDir,
  dirSize,
  formatBytes,
  type StorageEntry,
  type StorageUsage,
} from "../services/storage-usage";
import { oneOf } from "./validate";

/** Directories the dashboard measures, and whether **Clear** will empty them.
 *
 * `clearable` is the whole safety model here: only caches and re-downloadable assets are
 * listed as true. Slide frames and posters are user-visible content that nothing would
 * regenerate, so they are measured and never offered for deletion. Downloaded media is not
 * a directory at all — it is summed from the database, and removing it stays a per-item
 * action in the Library, where the row and its artifacts go together.
 */
export interface StorageDirs {
  thumbnails: string;
  posters: string;
  frames: string;
  whisperModels: string;
  binaries: string;
  tesseract: string;
  databaseFile: string;
  downloadsDir: string;
}

type Clearable = "thumbnails" | "whisperModels" | "tesseract";
const CLEARABLE: Clearable[] = ["thumbnails", "whisperModels", "tesseract"];

const DESCRIPTIONS: Record<string, string> = {
  media:
    "Video and audio files you have downloaded. Remove these in the Library.",
  database: "Titles, transcripts, summaries, and tags.",
  frames: "Slide images extracted from videos, and their crops.",
  posters: "Cover frames pulled from files you imported.",
  thumbnails: "Cached channel and video images. Re-fetched when needed.",
  whisperModels: "The local speech-to-text model. Re-downloadable in Settings.",
  binaries: "yt-dlp, ffmpeg, and the JS runtime. Re-downloadable in Settings.",
  tesseract: "OCR language data cache. The bundled English data is separate.",
};

const LABELS: Record<string, string> = {
  media: "Downloaded media",
  database: "Library database",
  frames: "Slide frames",
  posters: "Posters",
  thumbnails: "Thumbnail cache",
  whisperModels: "Whisper model",
  binaries: "Binaries",
  tesseract: "OCR cache",
};

function entry(key: string, bytes: number, clearable: boolean): StorageEntry {
  return {
    key,
    label: LABELS[key] ?? key,
    description: DESCRIPTIONS[key] ?? "",
    bytes,
    clearable,
  };
}

/** Bytes of downloaded media, from the rows rather than a walk of the downloads folder —
 * that folder is user-chosen and may hold unrelated files, and may be very large. */
function mediaBytes(db: SiftDatabase): number {
  try {
    const row = db
      .prepare<{ total: number | null }>(
        "SELECT SUM(file_size) AS total FROM download WHERE status = 'done'",
      )
      .get();
    return row?.total ?? 0;
  } catch {
    return 0;
  }
}

function fileBytes(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/**
 * Registers `storage:usage` + `storage:clear`.
 *
 * `storage:clear` shows a native confirm before deleting anything, and only accepts the
 * three keys in `CLEARABLE` — the renderer cannot name an arbitrary directory.
 */
export function registerStorageIpc(deps: {
  dirs: () => StorageDirs;
  getDb: () => SiftDatabase;
  getWindows: () => BrowserWindow[];
  freeDiskBytes: (path: string) => number | null;
}): void {
  async function usage(): Promise<StorageUsage> {
    const d = deps.dirs();
    const [frames, posters, thumbnails, whisperModels, binaries, tesseract] =
      await Promise.all([
        dirSize(d.frames),
        dirSize(d.posters),
        dirSize(d.thumbnails),
        dirSize(d.whisperModels),
        dirSize(d.binaries),
        dirSize(d.tesseract),
      ]);
    const entries: StorageEntry[] = [
      entry("media", mediaBytes(deps.getDb()), false),
      entry("database", fileBytes(d.databaseFile), false),
      entry("frames", frames, false),
      entry("posters", posters, false),
      entry("thumbnails", thumbnails, true),
      entry("whisperModels", whisperModels, true),
      entry("binaries", binaries, false),
      entry("tesseract", tesseract, true),
    ];
    return {
      entries,
      totalBytes: entries.reduce((sum, e) => sum + e.bytes, 0),
      freeBytes: deps.freeDiskBytes(d.downloadsDir),
    };
  }

  ipcMain.handle(IPC.storageUsage, () => usage());

  ipcMain.handle(IPC.storageClear, async (_e, key: string): Promise<number> => {
    const which = oneOf(key, "key", CLEARABLE);
    const d = deps.dirs();
    const path = d[which];
    const bytes = await dirSize(path);
    if (bytes === 0) return 0;

    const label = LABELS[which] ?? which;
    const win = deps.getWindows()[0];
    const opts = {
      type: "warning" as const,
      buttons: ["Delete", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: `Clear ${label.toLowerCase()}`,
      message: `Delete ${formatBytes(bytes)} of ${label.toLowerCase()}?`,
      detail:
        which === "whisperModels"
          ? "Local transcription stops working until you install the model again in Settings → Transcription. Anything transcribing right now will fail."
          : "This is a cache. It is rebuilt the next time it is needed.",
    };
    const { response } = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts);
    if (response !== 0) return 0;
    return clearDir(path);
  });
}
