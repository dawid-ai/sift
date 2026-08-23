import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { BrowserWindow } from "electron";
import { dialog, ipcMain } from "electron";
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
import type {
  ExportFormat,
  FrameExportService,
} from "../services/frame-export-service";
import { createOllamaSlideClassifier } from "../services/frame-classifier";
import { getDb } from "../index";
import { bool, id, int, nonEmptyStr, obj, oneOf, optional } from "./validate";
import { frameCrop } from "./validate-payloads";

/** `65000` ms → `01-05` (mm-ss, filesystem-safe) for slide filenames. */
function tsTag(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}-${pad(m)}-${pad(s)}` : `${pad(m)}-${pad(s)}`;
}

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
  if (!download?.file_path)
    throw new Error("Download the video before extracting frames.");
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
    async (
      _event,
      rawMediaId: number,
      rawOpts?: { classifierModel?: string; fullScreenOnly?: boolean },
    ) => {
      const mediaId = id(rawMediaId, "mediaId");
      const o = rawOpts == null ? {} : obj(rawOpts, "opts");
      const opts = {
        classifierModel: optional(o.classifierModel, (v) =>
          nonEmptyStr(v, "opts.classifierModel", 200),
        ),
        fullScreenOnly: optional(o.fullScreenOnly, (v) =>
          bool(v, "opts.fullScreenOnly"),
        ),
      };
      const videoPath = requireDownloadedPath(mediaId);
      const durationSec = getMediaById(getDb(), mediaId)?.duration_s ?? null;
      const crop = getFrameCrop(getDb(), mediaId);
      const classifier = opts?.classifierModel
        ? createOllamaSlideClassifier({ model: opts.classifierModel })
        : undefined;
      const rows = await service.extract(
        {
          mediaId,
          videoPath,
          durationSec,
          crop,
          classifier,
          fullScreenOnly: opts?.fullScreenOnly,
        },
        (p: FrameProgress) => {
          for (const win of getWindows())
            win.webContents.send(IPC.framesProgress, p);
        },
      );
      return rows.map(toRecord);
    },
  );

  ipcMain.handle(
    IPC.framesCapture,
    async (_event, rawMediaId: number, rawTsMs: number) => {
      const mediaId = id(rawMediaId, "mediaId");
      const tsMs = int(rawTsMs, "tsMs", 0, 1_000_000_000);
      const videoPath = requireDownloadedPath(mediaId);
      const crop = getFrameCrop(getDb(), mediaId);
      return toRecord(
        await service.captureFrame({ mediaId, videoPath, tsMs, crop }),
      );
    },
  );

  ipcMain.handle(
    IPC.framesGetCrop,
    (_event, mediaId: number) =>
      getFrameCrop(getDb(), id(mediaId, "mediaId")) ?? null,
  );

  ipcMain.handle(
    IPC.framesSetCrop,
    (_event, rawMediaId: number, crop: FrameCrop | null) => {
      const mediaId = id(rawMediaId, "mediaId");
      if (crop) setFrameCrop(getDb(), mediaId, frameCrop(crop));
      else clearFrameCrop(getDb(), mediaId);
    },
  );

  ipcMain.handle(
    IPC.framesSetIncluded,
    (_event, frameId: number, included: boolean) => {
      setFrameIncluded(
        getDb(),
        id(frameId, "frameId"),
        bool(included, "included"),
      );
    },
  );

  ipcMain.handle(IPC.framesList, (_event, mediaId: number) =>
    getFramesByMediaId(getDb(), id(mediaId, "mediaId")).map(toRecord),
  );

  ipcMain.handle(IPC.framesSaveSelected, async (_event, mediaId: number) => {
    const rows = getFramesByMediaId(getDb(), id(mediaId, "mediaId")).filter(
      (f) => f.included === 1,
    );
    if (rows.length === 0) throw new Error("No slides selected.");
    const win = getWindows()[0];
    const picked = win
      ? await dialog.showOpenDialog(win, {
          properties: ["openDirectory", "createDirectory"],
        })
      : await dialog.showOpenDialog({
          properties: ["openDirectory", "createDirectory"],
        });
    if (picked.canceled || !picked.filePaths[0]) return null;
    const dir = picked.filePaths[0];
    // Frames are stored at native resolution already (no downscale on grab), so a copy is
    // the max quality available — no re-encode. Named slide-NN-<mm-ss> in timeline order.
    // Copied one at a time with `await`, not `copyFileSync`: a 200-slide export is a few
    // hundred megabytes, and a sync loop freezes every window until it finishes.
    let count = 0;
    for (const [i, f] of rows.entries()) {
      const stamp = tsTag(f.ts_ms);
      const name = `slide-${String(i + 1).padStart(3, "0")}-${stamp}${extname(f.image_path) || ".jpg"}`;
      await copyFile(f.image_path, join(dir, name));
      count++;
    }
    return { dir, count };
  });

  ipcMain.handle(
    IPC.framesExport,
    (
      _event,
      mediaId: number,
      format: ExportFormat,
      rawPolish?: { providerId: string; model: string },
    ) => {
      const p0 = rawPolish == null ? null : obj(rawPolish, "polish");
      const polish =
        p0 === null
          ? undefined
          : {
              providerId: nonEmptyStr(p0.providerId, "polish.providerId", 100),
              model: nonEmptyStr(p0.model, "polish.model", 200),
            };
      return exportService.export(
        id(mediaId, "mediaId"),
        oneOf(format, "format", ["md", "pdf"] as const),
        polish,
        (p) => {
          for (const win of getWindows())
            win.webContents.send(IPC.framesExportProgress, p);
        },
      );
    },
  );
}
