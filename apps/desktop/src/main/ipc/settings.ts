import { ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";
import { str, strArray } from "./validate";

/** Registers the transcript-language and proxy settings channels. Errors propagate. */
export function registerSettingsIpc(
  store: {
    get(): string[];
    set(langs: string[]): void;
  },
  network: {
    get(): string;
    set(proxyUrl: string): string;
  },
): void {
  ipcMain.handle(IPC.settingsGetTranscriptLanguages, () => store.get());
  ipcMain.handle(IPC.settingsSetTranscriptLanguages, (_e, langs: string[]) => {
    store.set(strArray(langs, "langs", 50, 32));
  });
  ipcMain.handle(IPC.settingsGetProxy, () => network.get());
  ipcMain.handle(IPC.settingsSetProxy, (_e, proxyUrl: string) =>
    // The store re-validates the scheme and host; this only bounds the length.
    network.set(str(proxyUrl, "proxyUrl", 2048)),
  );
}
