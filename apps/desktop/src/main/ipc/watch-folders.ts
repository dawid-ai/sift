import {
  dialog,
  ipcMain,
  type BrowserWindow,
  type OpenDialogOptions,
} from "electron";
import { IPC } from "@sift/ipc-contract";
import type { WatchFolderService } from "../services/watch-folder-service";
import type { WatchFoldersConfig } from "../settings/watch-folders-config";
import { absPath, strArray } from "./validate";

/** Registers `watchFolders:*`. Errors propagate. */
export function registerWatchFoldersIpc(deps: {
  store: {
    get(): WatchFoldersConfig;
    setFolders(folders: string[]): WatchFoldersConfig;
  };
  service: () => WatchFolderService;
  getWindows: () => BrowserWindow[];
}): void {
  ipcMain.handle(IPC.watchFoldersList, () => deps.store.get().folders);

  ipcMain.handle(IPC.watchFoldersSet, (_e, folders: string[]) => {
    const checked = strArray(folders, "folders", 20, 4096).map((f) =>
      absPath(f, "folder"),
    );
    const saved = deps.store.setFolders(checked);
    // Re-attach immediately, so adding a folder starts watching without a restart.
    deps.service().start();
    return saved.folders;
  });

  ipcMain.handle(IPC.watchFoldersPick, async () => {
    const win = deps.getWindows()[0];
    const opts: OpenDialogOptions = {
      title: "Choose a folder to watch",
      properties: ["openDirectory"],
    };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  /** Scans now, whatever the watchers have or haven't reported. */
  ipcMain.handle(IPC.watchFoldersScan, () => deps.service().scan());
}
