import { writeFileSync } from "node:fs";
import { dialog, ipcMain, type BrowserWindow } from "electron";
import { branding } from "@sift/core";
import { IPC } from "@sift/ipc-contract";
import type { Diagnostics } from "../diagnostics";

/**
 * Registers `diagnostics:get` / `diagnostics:export`.
 *
 * The export writes the same object the renderer already displays, so a user can read the
 * bundle in the app before deciding to attach it to an issue. Nothing is uploaded — the
 * file goes wherever the save dialog points.
 */
export function registerDiagnosticsIpc(
  diagnostics: Diagnostics,
  getWindows: () => BrowserWindow[],
): void {
  ipcMain.handle(IPC.diagnosticsGet, () => diagnostics.report());

  ipcMain.handle(IPC.diagnosticsExport, async () => {
    const report = diagnostics.report();
    const stamp = report.generatedAt.replace(/[:.]/g, "-");
    const opts = {
      title: "Save support bundle",
      defaultPath: `${branding.appName.toLowerCase()}-diagnostics-${stamp}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    };
    const win = getWindows()[0];
    const picked = win
      ? await dialog.showSaveDialog(win, opts)
      : await dialog.showSaveDialog(opts);
    if (picked.canceled || !picked.filePath) return null;
    writeFileSync(picked.filePath, JSON.stringify(report, null, 2), "utf8");
    return picked.filePath;
  });
}
