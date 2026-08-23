import { ipcMain } from "electron";
import { IPC, type QueueSpec } from "@sift/ipc-contract";
import type { QueueWorker } from "../services/queue-worker";
import { httpUrl, id, oneOf, strArray } from "./validate";
import { queueSpec } from "./validate-payloads";

/**
 * Registers the queue request handlers. The worker's snapshot emissions are
 * broadcast to windows via its injected `emit` (wired in index.ts), not here.
 */
export function registerQueueIpc(worker: QueueWorker): void {
  ipcMain.handle(IPC.queueAdd, (_e, urls: string[], spec: QueueSpec) =>
    worker.add(
      strArray(urls, "urls", 2000, 4096).map((u, i) =>
        httpUrl(u, "urls[" + i + "]"),
      ),
      queueSpec(spec),
    ),
  );
  ipcMain.handle(IPC.queueList, () => worker.list());
  ipcMain.handle(IPC.queueRemove, (_e, itemId: number) =>
    worker.remove(id(itemId, "id")),
  );
  ipcMain.handle(IPC.queueReorder, (_e, itemId: number, dir: "up" | "down") =>
    worker.reorder(
      id(itemId, "id"),
      oneOf(dir, "dir", ["up", "down"] as const),
    ),
  );
  ipcMain.handle(IPC.queueRetry, (_e, itemId: number) =>
    worker.retry(id(itemId, "id")),
  );
  ipcMain.handle(IPC.queueCancel, (_e, itemId: number) =>
    worker.cancel(id(itemId, "id")),
  );
  ipcMain.handle(IPC.queuePause, () => worker.pause());
  ipcMain.handle(IPC.queueResume, () => worker.resume());
  ipcMain.handle(IPC.queueIsPaused, () => worker.isPaused());
}
