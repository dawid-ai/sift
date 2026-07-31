import { ipcMain } from "electron";
import { IPC, type QueueSpec } from "@sift/ipc-contract";
import type { QueueWorker } from "../services/queue-worker";

/**
 * Registers the queue request handlers. The worker's snapshot emissions are
 * broadcast to windows via its injected `emit` (wired in index.ts), not here.
 */
export function registerQueueIpc(worker: QueueWorker): void {
  ipcMain.handle(IPC.queueAdd, (_e, urls: string[], spec: QueueSpec) => worker.add(urls, spec));
  ipcMain.handle(IPC.queueList, () => worker.list());
  ipcMain.handle(IPC.queueRemove, (_e, id: number) => worker.remove(id));
  ipcMain.handle(IPC.queueReorder, (_e, id: number, dir: "up" | "down") => worker.reorder(id, dir));
  ipcMain.handle(IPC.queueRetry, (_e, id: number) => worker.retry(id));
  ipcMain.handle(IPC.queueCancel, (_e, id: number) => worker.cancel(id));
  ipcMain.handle(IPC.queuePause, () => worker.pause());
  ipcMain.handle(IPC.queueResume, () => worker.resume());
  ipcMain.handle(IPC.queueIsPaused, () => worker.isPaused());
}
