import { ipcMain, type BrowserWindow } from "electron";
import { IPC, type MediaMetadata, type TranscriptMethod, type TranscriptProgress } from "@sift/ipc-contract";
import type { TranscriptService } from "../services/transcript-service";

/**
 * Registers the `transcript:get` handler and forwards coarse stage progress to every
 * open window over `transcript:progress`. Errors (including "no captions found") are
 * intentionally left to propagate: `ipcMain.handle` turns a thrown/rejected handler
 * into a rejected renderer-side invoke. Also registers `transcript:getMethod`/
 * `transcript:setMethod` against the persisted default-method store.
 */
export function registerTranscriptIpc(
  service: TranscriptService,
  getWindows: () => BrowserWindow[],
  methodStore: { get(): TranscriptMethod; set(m: TranscriptMethod): void },
): void {
  ipcMain.handle(
    IPC.transcriptGet,
    (_event, input: { metadata: MediaMetadata; force?: "whisper" }) =>
      service.get(input, (p: TranscriptProgress) => {
        for (const win of getWindows()) win.webContents.send(IPC.transcriptProgress, p);
      }),
  );
  ipcMain.handle(IPC.transcriptGetMethod, () => methodStore.get());
  ipcMain.handle(IPC.transcriptSetMethod, (_event, m: TranscriptMethod) => methodStore.set(m));
}
