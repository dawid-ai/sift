import { ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";
import { mediaSourceUrl } from "./validate";
import type { MetadataService } from "../services/metadata-service";

/**
 * Registers `metadata:fetch` / `metadata:listExtractors` handlers. Errors (including
 * `YtDlpNotInstalledError`) are intentionally left to propagate: `ipcMain.handle`
 * turns a thrown/rejected handler into a rejected renderer-side invoke.
 */
export function registerMetadataIpc(service: MetadataService): void {
  ipcMain.handle(IPC.metadataFetch, (_event, url: string) =>
    // The URL becomes a yt-dlp argv value and a network fetch, so it is parsed here
    // rather than trusted from the renderer. `file:` is allowed: an imported local file
    // stores its path as a file URL and is re-resolved through this same handler.
    service.fetch(mediaSourceUrl(url, "url")),
  );

  ipcMain.handle(IPC.metadataListExtractors, () => service.listExtractors());
}
