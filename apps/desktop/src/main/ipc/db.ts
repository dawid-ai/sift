import { ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";

export function registerDbIpc(isReady: () => boolean): void {
  ipcMain.handle(IPC.dbIsReady, () => isReady());
}
