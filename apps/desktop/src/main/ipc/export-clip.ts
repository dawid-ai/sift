import { ipcMain, shell } from "electron";
import { IPC } from "@sift/ipc-contract";
import { segmentsToText, type TranscriptSegment } from "@sift/core";
import { updateTranscriptContent, type SiftDatabase } from "@sift/db";
import type { ExportService } from "../services/export-service";
import type { ClipService } from "../services/clip-service";
import { id, num, oneOf, str } from "./validate";
import { transcriptSegments } from "./validate-payloads";

const PRESETS = ["markdown", "html", "json", "csv", "obsidian", "pdf"] as const;
const CLIP_KINDS = ["audio", "video", "vertical"] as const;

/** Registers `transcript:update`, `export:preset`, `clip:link`, and `clip:export`. */
export function registerExportClipIpc(deps: {
  getDb: () => SiftDatabase;
  exportService: () => ExportService;
  clipService: () => ClipService;
}): void {
  ipcMain.handle(
    IPC.transcriptUpdate,
    (_e, transcriptId: number, segments: TranscriptSegment[]) => {
      const checked = transcriptSegments(segments);
      // `text` is regenerated from the segments rather than accepted from the renderer, so the
      // searchable body and the timed cues cannot disagree after an edit.
      updateTranscriptContent(deps.getDb(), id(transcriptId, "transcriptId"), {
        text: segmentsToText(checked),
        segments_json: JSON.stringify(checked),
      });
    },
  );

  ipcMain.handle(IPC.exportPreset, (_e, mediaId: number, preset: string) =>
    deps
      .exportService()
      .export(id(mediaId, "mediaId"), oneOf(preset, "preset", [...PRESETS])),
  );

  ipcMain.handle(IPC.clipLink, (_e, mediaId: number, seconds: number) =>
    deps
      .clipService()
      .link(id(mediaId, "mediaId"), num(seconds, "seconds", 0, 86_400 * 30)),
  );

  ipcMain.handle(
    IPC.clipExport,
    (_e, mediaId: number, kind: string, start: number, end: number) =>
      deps.clipService().export({
        mediaId: id(mediaId, "mediaId"),
        kind: oneOf(kind, "kind", [...CLIP_KINDS]),
        range: {
          startSeconds: num(start, "start", 0, 86_400 * 30),
          endSeconds: num(end, "end", 0, 86_400 * 30),
        },
      }),
  );

  ipcMain.handle(IPC.exportReveal, (_e, path: string) => {
    // Same reasoning as library:reveal — the argument comes from the renderer even though
    // showItemInFolder only selects a file.
    shell.showItemInFolder(str(path, "path", 4096));
  });
}
