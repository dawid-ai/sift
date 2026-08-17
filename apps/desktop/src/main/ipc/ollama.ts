import { ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";
import {
  DEFAULT_OLLAMA_BASE_URL,
  ollamaReachable,
  startOllama,
} from "../ai/ollama-health";

/** Registers `ollama:health` and `ollama:start`. In e2e-fixture mode the health check is
 * deterministic (reachable, or unreachable when SIFT_E2E_OLLAMA_DOWN=1) so specs don't
 * depend on a real local Ollama daemon. */
export function registerOllamaIpc(isE2E: boolean): void {
  ipcMain.handle(IPC.ollamaHealth, () => {
    if (isE2E) return process.env.SIFT_E2E_OLLAMA_DOWN !== "1";
    return ollamaReachable(DEFAULT_OLLAMA_BASE_URL);
  });
  ipcMain.handle(IPC.ollamaStart, () => {
    if (isE2E) return { launched: true };
    return startOllama();
  });
}
