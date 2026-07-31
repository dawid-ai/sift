import { ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";
import { DEFAULT_OLLAMA_BASE_URL, ollamaReachable, startOllama } from "../ai/ollama-health";

/** Registers `ollama:health` (reachability ping) and `ollama:start` (detached launch). */
export function registerOllamaIpc(): void {
  ipcMain.handle(IPC.ollamaHealth, () => ollamaReachable(DEFAULT_OLLAMA_BASE_URL));
  ipcMain.handle(IPC.ollamaStart, () => startOllama());
}
