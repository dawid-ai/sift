import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { IPC, type BinaryKind } from "@sift/ipc-contract";
import type { BinariesService } from "../services/binaries-service";

/**
 * Registers `binaries:list` / `binaries:check` / `binaries:install` handlers and
 * forwards install progress to every open window over `binaries:progress`.
 */
export function registerBinariesIpc(
  service: BinariesService,
  getWindows: () => BrowserWindow[],
): void {
  ipcMain.handle(IPC.binariesList, () => service.list());

  ipcMain.handle(IPC.binariesCheck, (_event, kind: BinaryKind) => service.check(kind));

  ipcMain.handle(IPC.binariesInstall, (_event, kind: BinaryKind) =>
    service.install(kind, (progress) => {
      for (const win of getWindows()) {
        win.webContents.send(IPC.binariesProgress, progress);
      }
    }),
  );
}
