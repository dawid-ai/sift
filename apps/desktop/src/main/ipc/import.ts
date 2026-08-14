import { dialog, ipcMain } from "electron";
import { MEDIA_EXTENSIONS } from "@sift/core";
import { IPC } from "@sift/ipc-contract";
import type { DownloadService } from "../services/download-service";

/**
 * Registers `import:local` / `import:pick`. Errors are intentionally left to propagate:
 * `ipcMain.handle` turns a thrown/rejected handler into a rejected renderer-side invoke.
 */
export function registerImportIpc(service: DownloadService): void {
  ipcMain.handle(
    IPC.importLocal,
    (_event, input: { path: string; durationSec?: number | null; tags?: string[] }) =>
      service.importLocal(input),
  );

  ipcMain.handle(IPC.importPick, async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose media files",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Media", extensions: [...MEDIA_EXTENSIONS] }],
    });
    return result.canceled ? [] : result.filePaths;
  });
}
