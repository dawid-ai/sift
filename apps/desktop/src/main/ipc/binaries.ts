import type { BrowserWindow } from "electron";
import { oneOf } from "./validate";
import { ipcMain } from "electron";
import {
  IPC,
  type BinaryKind,
  type BinaryUpdateEvent,
  type BinaryUpdatePolicy,
} from "@sift/ipc-contract";
import type { BinariesService } from "../services/binaries-service";

/**
 * Registers `binaries:list` / `binaries:check` / `binaries:install` handlers and
 * forwards install progress to every open window over `binaries:progress`.
 */
/** A managed-binary kind. The value selects a download URL and an on-disk path, so it
 * is checked against the known set rather than trusted from the renderer. */
function binaryKind(v: unknown): BinaryKind {
  return oneOf(v, "kind", ["ytdlp", "ffmpeg", "deno"] as const);
}

export function registerBinariesIpc(
  service: BinariesService,
  getWindows: () => BrowserWindow[],
): void {
  ipcMain.handle(IPC.binariesList, () => service.list());

  ipcMain.handle(IPC.binariesCheck, (_event, kind: BinaryKind) =>
    service.check(binaryKind(kind)),
  );

  ipcMain.handle(IPC.binariesInstall, (_event, kind: BinaryKind) =>
    service.install(binaryKind(kind), (progress) => {
      for (const win of getWindows()) {
        win.webContents.send(IPC.binariesProgress, progress);
      }
    }),
  );
}

interface PolicyStore {
  get(): BinaryUpdatePolicy;
  set(mode: BinaryUpdatePolicy): void;
}

/**
 * Registers policy get/set + the `binaries:updateEvent` push channel. Caches the
 * latest event per kind so a renderer mounting after startup maintenance ran can
 * recover them via `binaries:currentUpdateEvent` (startup race). Returns `emit` for
 * the startup runner to push lifecycle events, and `currentEvents` for tests.
 */
export function registerBinaryUpdatesIpc(
  getWindows: () => BrowserWindow[],
  policyStore: PolicyStore,
): { emit(e: BinaryUpdateEvent): void; currentEvents(): BinaryUpdateEvent[] } {
  const lastByKind = new Map<BinaryUpdateEvent["kind"], BinaryUpdateEvent>();

  const emit = (e: BinaryUpdateEvent): void => {
    lastByKind.set(e.kind, e);
    for (const win of getWindows())
      win.webContents.send(IPC.binariesUpdateEvent, e);
  };

  ipcMain.handle(IPC.binariesGetPolicy, () => policyStore.get());
  ipcMain.handle(IPC.binariesSetPolicy, (_e, mode: BinaryUpdatePolicy) =>
    policyStore.set(oneOf(mode, "mode", ["auto", "notify"] as const)),
  );
  ipcMain.handle(IPC.binariesCurrentUpdateEvent, () => [
    ...lastByKind.values(),
  ]);

  return { emit, currentEvents: () => [...lastByKind.values()] };
}
