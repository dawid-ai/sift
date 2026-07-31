import { app, ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";

export function registerAppIpc(): void {
  ipcMain.handle(IPC.appGetVersion, () => app.getVersion());
  ipcMain.handle(IPC.appQuit, () => app.quit());
}
