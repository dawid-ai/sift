import { app, clipboard, ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";

export function registerAppIpc(): void {
  ipcMain.handle(IPC.appGetVersion, () => app.getVersion());
  ipcMain.handle(IPC.appQuit, () => app.quit());
  // Capped: this only ever feeds a "paste this?" suggestion, and a clipboard holding a
  // megabyte of text should not cross the bridge.
  ipcMain.handle(IPC.appReadClipboardText, () =>
    clipboard.readText().trim().slice(0, 4096),
  );
}
