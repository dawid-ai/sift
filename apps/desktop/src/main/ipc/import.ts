import { dialog, ipcMain, type BrowserWindow, type OpenDialogOptions } from "electron";
import { MEDIA_EXTENSIONS } from "@sift/core";
import { IPC } from "@sift/ipc-contract";
import type { DownloadService } from "../services/download-service";

/**
 * Registers `import:local` / `import:pick`. Errors are intentionally left to propagate:
 * `ipcMain.handle` turns a thrown/rejected handler into a rejected renderer-side invoke.
 */
export function registerImportIpc(service: DownloadService, getWindows: () => BrowserWindow[]): void {
  ipcMain.handle(
    IPC.importLocal,
    (_event, input: { path: string; durationSec?: number | null; tags?: string[] }) =>
      service.importLocal(input),
  );

  ipcMain.handle(IPC.importPick, async () => {
    // Parented to the window so the dialog is app-modal — the renderer can't be
    // interacted with (including clicking "choose a file" again) while it's open.
    const win = getWindows()[0];
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
