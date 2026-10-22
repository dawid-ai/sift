import { ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";
import { nonEmptyStr } from "./validate";
import type { AuthManager } from "../auth/auth-manager";
import type { ChromeSignIn } from "../auth/chrome-sign-in";

/** Registers the `auth:*` handlers. Errors propagate. */
export function registerAuthIpc(
  manager: AuthManager,
  chromeSignIn: ChromeSignIn,
): void {
  ipcMain.handle(IPC.authOpenBrowser, () => manager.openBrowser());
  ipcMain.handle(IPC.authListSites, () => manager.listSites());
  ipcMain.handle(IPC.authRemoveSite, (_e, domain: string) =>
    manager.removeSite(nonEmptyStr(domain, "domain", 253)),
  );
  ipcMain.handle(IPC.authChromeBrowser, () => chromeSignIn.browserName());
  ipcMain.handle(IPC.authSignInWithChrome, () => chromeSignIn.signIn());
}
