import { existsSync } from "node:fs";
import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { IPC, type FrameProgress, type FrameRecord } from "@sift/ipc-contract";
import {
  clearFrameCrop,
  getFrameCrop,
  getFramesByMediaId,
  getMediaById,
  listDownloadsByMediaId,
  setFrameCrop,
  setFrameIncluded,
  type FrameCrop,
  type FrameRow,
} from "@sift/db";
import type { FrameService } from "../services/frame-service";
import type { ExportFormat, FrameExportService } from "../services/frame-export-service";
import { createOllamaSlideClassifier } from "../services/frame-classifier";
import { getDb } from "../index";

function toRecord(row: FrameRow): FrameRecord {
  return {
    id: row.id,
    mediaId: row.media_id,
    tsMs: row.ts_ms,
    imageUrl: `sift-frame://file/${encodeURIComponent(row.image_path)}`,
    ocrText: row.ocr_text,
    ocrConfidence: row.ocr_confidence,
    kind: row.kind,
    included: row.included === 1,
  };
}

/** The media's downloaded video file, or throws the same message the UI already handles. */
function requireDownloadedPath(mediaId: number): string {
  const download = listDownloadsByMediaId(getDb(), mediaId).find(
    (d) => d.file_path && existsSync(d.file_path),
  );
  if (!download?.file_path) throw new Error("Download the video before extracting frames.");
  return download.file_path;
}

/**
 * Registers `frames:extract` (resolves the media's downloaded video, runs the extraction
 * service, streams progress to every window over `frames:progress`) and `frames:list`.
 * Errors propagate — `ipcMain.handle` rejects the renderer's invoke.
 */
export function registerFramesIpc(
  service: FrameService,
  exportService: FrameExportService,
  getWindows: () => BrowserWindow[],
): void {
  ipcMain.handle(
    IPC.framesExtract,
    async (_event, mediaId: number, opts?: { classifierModel?: string; fullScreenOnly?: boolean }) => {
      const videoPath = requireDownloadedPath(mediaId);
      const durationSec = getMediaById(getDb(), mediaId)?.duration_s ?? null;
      const crop = getFrameCrop(getDb(), mediaId);
      const classifier = opts?.classifierModel
        ? createOllamaSlideClassifier({ model: opts.classifierModel })
        : undefined;
      const rows = await service.extract(
        { mediaId, videoPath, durationSec, crop, classifier, fullScreenOnly: opts?.fullScreenOnly },
        (p: FrameProgress) => {
          for (const win of getWindows()) win.webContents.send(IPC.framesProgress, p);
        },
      );
      return rows.map(toRecord);
    },
  );

  ipcMain.handle(IPC.framesCapture, async (_event, mediaId: number, tsMs: number) => {
    const videoPath = requireDownloadedPath(mediaId);
    const crop = getFrameCrop(getDb(), mediaId);
    return toRecord(await service.captureFrame({ mediaId, videoPath, tsMs, crop }));
  });

  ipcMain.handle(IPC.framesGetCrop, (_event, mediaId: number) => getFrameCrop(getDb(), mediaId) ?? null);

  ipcMain.handle(IPC.framesSetCrop, (_event, mediaId: number, crop: FrameCrop | null) => {
    if (crop) setFrameCrop(getDb(), mediaId, crop);
    else clearFrameCrop(getDb(), mediaId);
  });

  ipcMain.handle(IPC.framesSetIncluded, (_event, frameId: number, included: boolean) => {
    setFrameIncluded(getDb(), frameId, included);
  });

  ipcMain.handle(IPC.framesList, (_event, mediaId: number) =>
    getFramesByMediaId(getDb(), mediaId).map(toRecord),
  );

  ipcMain.handle(IPC.framesExport, (_event, mediaId: number, format: ExportFormat) =>
    exportService.export(mediaId, format),
  );
}
