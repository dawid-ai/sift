import { ipcMain } from "electron";
import { listPrompts, createPrompt, updatePrompt, deletePrompt, type PromptRow } from "@sift/db";
import { IPC, type MediaMetadata, type PromptInfo, type SummaryToken } from "@sift/ipc-contract";
import type { SummarizeService } from "../services/summarize-service";
import { getDb } from "../index";

function toPromptInfo(row: PromptRow): PromptInfo {
  return { id: row.id, name: row.name, body: row.body, isBuiltin: row.is_builtin === 1 };
}

/**
 * Registers `summarize:start`/`summarize:export` and `prompts:list`. `summarize:start`
 * streams token deltas back to the initiating window over `summarize:token` (keyed by the
 * caller-supplied `requestId`) as they arrive, then sends a final `done: true` token
 * once the summary is persisted. Errors (including "Get a transcript first.", an
 * unknown provider, or a missing prompt) are intentionally left to propagate:
 * `ipcMain.handle` turns a thrown/rejected handler into a rejected renderer-side invoke.
 *
 * Tokens go to `event.sender` (the caller's webContents), not all windows: `requestId`
 * is a per-view counter, so a broadcast would let two windows collide on the same id.
 */
export function registerSummarizeIpc(service: SummarizeService): void {
  ipcMain.handle(
    IPC.summarizeStart,
    (
      event,
      input: { metadata: MediaMetadata; providerId: string; model: string; promptId: number; requestId: string },
    ) =>
      service
        .start(input, (delta) => {
          const t: SummaryToken = { requestId: input.requestId, delta, done: false };
          event.sender.send(IPC.summarizeToken, t);
        })
        .then((record) => {
          const t: SummaryToken = { requestId: input.requestId, delta: "", done: true };
          event.sender.send(IPC.summarizeToken, t);
          return record;
        }),
  );

  ipcMain.handle(IPC.summarizeExport, (_event, summaryId: number) => service.export(summaryId));

  ipcMain.handle(IPC.promptsList, () => listPrompts(getDb()).map(toPromptInfo));

  ipcMain.handle(IPC.promptsCreate, (_event, input: { name: string; body: string }) =>
    toPromptInfo(createPrompt(getDb(), input)),
  );

  ipcMain.handle(
    IPC.promptsUpdate,
    (_event, id: number, input: { name: string; body: string }) =>
      toPromptInfo(updatePrompt(getDb(), id, input)),
  );

  ipcMain.handle(IPC.promptsDelete, (_event, id: number) => deletePrompt(getDb(), id));
}
