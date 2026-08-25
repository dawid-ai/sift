import { dialog, ipcMain, type BrowserWindow } from "electron";
import { IPC } from "@sift/ipc-contract";
import { absPath } from "./validate";

/** Registers `downloads:getPath` / `downloads:setPath` / `downloads:pickPath`. `pickPath`
 * opens a native directory picker (parented to the focused window, if any) and returns the
 * chosen absolute path, or `null` if the user cancelled. Errors propagate. */
export function registerDownloadsIpc(
  store: { get(): string; set(path: string): void },
  getFocused: () => BrowserWindow | null,
): void {
  ipcMain.handle(IPC.downloadsGetPath, () => store.get());
  ipcMain.handle(IPC.downloadsSetPath, (_e, path: string) =>
    store.set(absPath(path, "path")),
  );
  ipcMain.handle(IPC.downloadsPickPath, async () => {
    const win = getFocused();
    const res = win
      ? await dialog.showOpenDialog(win, { properties: ["openDirectory"] })
      : await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return res.canceled || res.filePaths.length === 0
      ? null
      : res.filePaths[0]!;
  });
}
