import { ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";

/** Registers `settings:getTranscriptLanguages` + `settings:setTranscriptLanguages`. Errors propagate. */
export function registerSettingsIpc(store: {
  get(): string[];
  set(langs: string[]): void;
}): void {
  ipcMain.handle(IPC.settingsGetTranscriptLanguages, () => store.get());
  ipcMain.handle(IPC.settingsSetTranscriptLanguages, (_e, langs: string[]) => {
    store.set(langs);
  });
}
