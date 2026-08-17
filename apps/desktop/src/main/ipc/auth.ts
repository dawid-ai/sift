import { ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";
import type { AuthManager } from "../auth/auth-manager";

/** Registers `auth:openBrowser` / `auth:listSites` / `auth:removeSite`. Errors propagate. */
export function registerAuthIpc(manager: AuthManager): void {
  ipcMain.handle(IPC.authOpenBrowser, () => manager.openBrowser());
  ipcMain.handle(IPC.authListSites, () => manager.listSites());
  ipcMain.handle(IPC.authRemoveSite, (_e, domain: string) =>
    manager.removeSite(domain),
  );
}
