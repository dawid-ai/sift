import { dialog, ipcMain } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import {
  listPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
  upsertPromptByName,
  type PromptRow,
} from "@sift/db";
import {
  IPC,
  type MediaMetadata,
  type PromptInfo,
  type PromptPackEntry,
  type SummaryToken,
} from "@sift/ipc-contract";
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

  ipcMain.handle(IPC.promptsExport, async () => {
    const pack: PromptPackEntry[] = listPrompts(getDb())
      .filter((p) => p.is_builtin === 0)
      .map((p) => ({ name: p.name, body: p.body }));
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export prompts",
      defaultPath: "sift-prompts.json",
      filters: [{ name: "Prompt pack", extensions: ["json"] }],
    });
    if (canceled || !filePath) return null;
    writeFileSync(filePath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
    return filePath;
  });

  ipcMain.handle(IPC.promptsImport, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Import prompts",
      properties: ["openFile"],
      filters: [{ name: "Prompt pack", extensions: ["json"] }],
    });
    const file = filePaths[0];
    if (canceled || !file) return 0;
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(parsed)) {
      throw new Error("That file isn't a prompt pack (expected a JSON array).");
    }
    const entries = parsed.filter(
      (e): e is PromptPackEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as PromptPackEntry).name === "string" &&
        (e as PromptPackEntry).name.trim() !== "" &&
        typeof (e as PromptPackEntry).body === "string" &&
        (e as PromptPackEntry).body.trim() !== "",
    );
    if (entries.length === 0) throw new Error("No valid prompts in that file.");
    const db = getDb();
    // ponytail: not wrapped in a transaction — SiftDatabase exposes only exec/prepare
    // (no `.transaction`), matching every other multi-row db write in this codebase
    // (see subscription.ts's replaceSubscriptions). Ceiling: if a later entry's name
    // collides with a built-in, upsertPromptByName throws after earlier entries in the
    // same pack already landed — acceptable since built-in names are reserved and packs
    // are hand-authored/reviewed, not adversarial input. Upgrade path: add `.transaction`
    // to the SiftDatabase interface (both the better-sqlite3 and sql.js drivers support
    // it) and wrap this loop if packs grow large enough for partial-apply to matter.
    for (const e of entries) upsertPromptByName(db, { name: e.name.trim(), body: e.body });
    return entries.length;
  });
}
