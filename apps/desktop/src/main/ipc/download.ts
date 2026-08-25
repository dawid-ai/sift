import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import {
  IPC,
  type DownloadOption,
  type MediaMetadata,
} from "@sift/ipc-contract";
import type { DownloadService } from "../services/download-service";
import { obj, strArray } from "./validate";
import { downloadOption, mediaMetadata } from "./validate-payloads";

/**
 * Registers the `download:start` handler and forwards progress to every open
 * window over `download:progress`. Errors (including a rejected yt-dlp download)
 * are intentionally left to propagate: `ipcMain.handle` turns a thrown/rejected
 * handler into a rejected renderer-side invoke.
 */
export function registerDownloadIpc(
  service: DownloadService,
  getWindows: () => BrowserWindow[],
): void {
  ipcMain.handle(
    IPC.downloadStart,
    (
      _event,
      input: {
        metadata: MediaMetadata;
        option: DownloadOption;
        tags?: string[];
      },
    ) =>
      service.start(
        {
          metadata: mediaMetadata(obj(input, "input").metadata),
          option: downloadOption(obj(input, "input").option),
          tags: strArray(
            obj(input, "input").tags ?? [],
            "input.tags",
            100,
            200,
          ),
        },
        (progress) => {
          for (const win of getWindows()) {
            win.webContents.send(IPC.downloadProgress, progress);
          }
        },
      ),
  );
}
