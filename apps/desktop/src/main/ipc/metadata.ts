import { ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";
import type { MetadataService } from "../services/metadata-service";

/**
 * Registers `metadata:fetch` / `metadata:listExtractors` handlers. Errors (including
 * `YtDlpNotInstalledError`) are intentionally left to propagate: `ipcMain.handle`
 * turns a thrown/rejected handler into a rejected renderer-side invoke.
 */
export function registerMetadataIpc(service: MetadataService): void {
  ipcMain.handle(IPC.metadataFetch, (_event, url: string) => service.fetch(url));

  ipcMain.handle(IPC.metadataListExtractors, () => service.listExtractors());
}
