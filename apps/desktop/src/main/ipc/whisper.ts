import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";
import type { WhisperSetupService } from "../services/whisper-setup-service";

/** Registers `whisper:status` / `whisper:install` and forwards install progress
 * to every open window over `whisper:progress`. */
export function registerWhisperIpc(
  service: Pick<WhisperSetupService, "status" | "install">,
  getWindows: () => BrowserWindow[],
): void {
  ipcMain.handle(IPC.whisperStatus, () => service.status());
  ipcMain.handle(IPC.whisperInstall, () =>
    service.install((p) => {
      for (const win of getWindows()) win.webContents.send(IPC.whisperProgress, p);
    }),
  );
}
