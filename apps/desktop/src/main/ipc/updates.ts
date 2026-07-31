import { app, ipcMain, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { IPC, type UpdateEvent } from "@sift/ipc-contract";
import { notesToText } from "../updates-notes";

/** Wire electron-updater to the renderer. autoDownload is off so the user chooses.
 * Events are forwarded to every open window as one UpdateEvent. Safe to call once. */
export function registerUpdatesIpc(getWindows: () => BrowserWindow[]): void {
  autoUpdater.autoDownload = false;

  let userInitiated = false;
  // Cache the last event so a renderer that mounts AFTER the startup check fired can
  // recover it via update:current (closes the startup timing race).
  let last: UpdateEvent | null = null;

  const send = (e: UpdateEvent) => {
    last = e;
    for (const win of getWindows()) win.webContents.send(IPC.updateEvent, e);
  };

  autoUpdater.on("checking-for-update", () => {
    if (userInitiated) send({ type: "checking" });
  });
  autoUpdater.on("update-available", (info) =>
    send({ type: "available", version: info.version, releaseNotes: notesToText(info.releaseNotes) }),
  );
  autoUpdater.on("update-not-available", () => send({ type: "not-available" }));
  autoUpdater.on("download-progress", (p) => send({ type: "downloading", percent: p.percent }));
  autoUpdater.on("update-downloaded", (info) => send({ type: "downloaded", version: info.version }));
  autoUpdater.on("error", (err) => {
    if (userInitiated) send({ type: "error", message: err == null ? "Unknown update error" : err.message ?? String(err) });
  });

  ipcMain.handle(IPC.updateCheck, async () => {
    userInitiated = true;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      send({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  });
  ipcMain.handle(IPC.updateDownload, async () => {
    userInitiated = true;
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      send({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  });
  ipcMain.handle(IPC.updateInstall, () => {
    autoUpdater.quitAndInstall();
  });
  ipcMain.handle(IPC.updateCurrent, () => last);

  // Dev/e2e only: inject a fake event to drive the UI without a live GitHub feed.
  if (!app.isPackaged) {
    ipcMain.handle(IPC.updateSimulate, (_e, event: UpdateEvent) => send(event));
  }
}
