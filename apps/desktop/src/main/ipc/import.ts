import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dialog, ipcMain, type BrowserWindow, type OpenDialogOptions } from "electron";
import { LOCAL_FORMAT_ID, MEDIA_EXTENSIONS } from "@sift/core";
import {
  listDownloadsByMediaId,
  setDownloadFormat,
  setMediaThumbnail,
  type SiftDatabase,
} from "@sift/db";
import { IPC, type MediaRecord } from "@sift/ipc-contract";
import type { DownloadService } from "../services/download-service";
import type { FfmpegRunner } from "../sidecars/ffmpeg";
import { jpegSize, posterSeekSeconds } from "../local-file";

export interface ImportIpcDeps {
  getWindows: () => BrowserWindow[];
  db: SiftDatabase;
  ffmpeg: FfmpegRunner;
  /** Directory posters are written into (userData/posters), served via sift-poster://. */
  postersDir: () => string;
}

/**
 * Grabs a poster frame for a just-imported file and points its media row at it.
 *
 * Always re-extracts rather than reusing an existing `<mediaId>.jpg`: SQLite reuses the
 * last rowid after a delete, so a cached file could otherwise be served as the poster for
 * a *different* import.
 *
 * Never throws. ffmpeg is an on-demand managed binary (absent on first run) and audio
 * files have no video stream at all — a missing thumbnail must never fail an import.
 */
async function attachPoster(
  deps: ImportIpcDeps,
  path: string,
  record: MediaRecord,
): Promise<MediaRecord> {
  const outputPath = join(deps.postersDir(), `${record.id}.jpg`);
  try {
    mkdirSync(deps.postersDir(), { recursive: true });
    await deps.ffmpeg.extractFrameAt({
      inputPath: path,
      outputPath,
      seconds: posterSeekSeconds(record.durationSec),
    });
  } catch {
    return record;
  }
  // Belt and braces: some ffmpeg builds exit 0 having written nothing (e.g. a seek past
  // the end of a short clip), so existence is checked rather than assumed.
  if (!existsSync(outputPath)) return record;
  setMediaThumbnail(deps.db, record.id, outputPath);
  backfillHeightFromPoster(deps.db, record.id, outputPath);
  return { ...record, thumbnailUrl: outputPath };
}

/**
 * Relabels the import's download row from the poster's dimensions when the renderer's
 * `<video>` probe couldn't supply a height — which is every picker import (no `File` to
 * probe) and any container Chromium won't decode. Without this the Formats column reads
 * "MP4" for an imported video and "2160p" for a downloaded one: two different kinds of
 * thing in the same column.
 *
 * Only fills a gap; a height the renderer already reported is left alone. Never throws
 * for the same reason the poster grab doesn't — a label is not worth failing an import.
 */
function backfillHeightFromPoster(db: SiftDatabase, mediaId: number, posterPath: string): void {
  const row = listDownloadsByMediaId(db, mediaId).find((d) => d.format_id === LOCAL_FORMAT_ID);
  if (!row || row.height) return;
  try {
    const size = jpegSize(readFileSync(posterPath));
    if (size?.height) setDownloadFormat(db, row.id, `${size.height}p`, size.height);
  } catch {
    /* unreadable poster — keep the container label */
  }
}

/**
 * Registers `import:local` / `import:pick`. Errors are intentionally left to propagate:
 * `ipcMain.handle` turns a thrown/rejected handler into a rejected renderer-side invoke.
 */
export function registerImportIpc(service: DownloadService, deps: ImportIpcDeps): void {
  ipcMain.handle(
    IPC.importLocal,
    async (
      _event,
      input: { path: string; durationSec?: number | null; height?: number | null; tags?: string[] },
    ) => attachPoster(deps, input.path, await service.importLocal(input)),
  );

  ipcMain.handle(IPC.importPick, async () => {
    // Parented to the window so the dialog is app-modal — the renderer can't be
    // interacted with (including clicking "choose a file" again) while it's open.
    const win = deps.getWindows()[0];
    const dialogOpts: OpenDialogOptions = {
      title: "Choose media files",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Media", extensions: [...MEDIA_EXTENSIONS] }],
    };
    const result = win
      ? await dialog.showOpenDialog(win, dialogOpts)
      : await dialog.showOpenDialog(dialogOpts);
    return result.canceled ? [] : result.filePaths;
  });
}
