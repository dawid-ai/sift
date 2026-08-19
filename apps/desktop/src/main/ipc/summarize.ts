import {
  dialog,
  ipcMain,
  type BrowserWindow,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { branding } from "@sift/core";
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
  type PromptImportResult,
  type PromptInfo,
  type PromptPackEntry,
  type SummaryToken,
} from "@sift/ipc-contract";
import type { SummarizeService } from "../services/summarize-service";
import { getDb } from "../index";
import { parsePromptPack } from "./prompt-pack";

function toPromptInfo(row: PromptRow): PromptInfo {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    isBuiltin: row.is_builtin === 1,
  };
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
export function registerSummarizeIpc(
  service: SummarizeService,
  getWindows: () => BrowserWindow[],
): void {
  ipcMain.handle(
    IPC.summarizeStart,
    (
      event,
      input: {
        metadata: MediaMetadata;
        providerId: string;
        model: string;
        promptId: number;
        requestId: string;
      },
    ) =>
      service
        .start(input, (delta) => {
          const t: SummaryToken = {
            requestId: input.requestId,
            delta,
            done: false,
          };
          event.sender.send(IPC.summarizeToken, t);
        })
        .then((record) => {
          const t: SummaryToken = {
            requestId: input.requestId,
            delta: "",
            done: true,
          };
          event.sender.send(IPC.summarizeToken, t);
          return record;
        }),
  );

  ipcMain.handle(IPC.summarizeExport, (_event, summaryId: number) =>
    service.export(summaryId),
  );

  ipcMain.handle(IPC.promptsList, () => listPrompts(getDb()).map(toPromptInfo));

  ipcMain.handle(
    IPC.promptsCreate,
    (_event, input: { name: string; body: string }) =>
      toPromptInfo(createPrompt(getDb(), input)),
  );

  ipcMain.handle(
    IPC.promptsUpdate,
    (_event, id: number, input: { name: string; body: string }) =>
      toPromptInfo(updatePrompt(getDb(), id, input)),
  );

  ipcMain.handle(IPC.promptsDelete, (_event, id: number) =>
    deletePrompt(getDb(), id),
  );

  ipcMain.handle(IPC.promptsExport, async () => {
    const pack: PromptPackEntry[] = listPrompts(getDb())
      .filter((p) => p.is_builtin === 0)
      .map((p) => ({ name: p.name, body: p.body }));
    const win = getWindows()[0];
    const dialogOpts: SaveDialogOptions = {
      title: "Export prompts",
      defaultPath: `${branding.slug}-prompts.json`,
      filters: [{ name: "Prompt pack", extensions: ["json"] }],
    };
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, dialogOpts)
      : await dialog.showSaveDialog(dialogOpts);
    if (canceled || !filePath) return null;
    writeFileSync(filePath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
    return filePath;
  });

  ipcMain.handle(IPC.promptsImport, async (): Promise<PromptImportResult> => {
    const win = getWindows()[0];
    const dialogOpts: OpenDialogOptions = {
      title: "Import prompts",
      properties: ["openFile"],
      filters: [{ name: "Prompt pack", extensions: ["json"] }],
    };
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, dialogOpts)
      : await dialog.showOpenDialog(dialogOpts);
    const file = filePaths[0];
    if (canceled || !file)
      return { imported: 0, skipped: 0, created: 0, replaced: 0 };
    const { entries, skipped } = parsePromptPack(readFileSync(file, "utf8"));
    if (entries.length === 0) {
      throw new Error(
        skipped > 0
          ? `No valid prompts in that file — all ${skipped} entries were malformed.`
          : "No valid prompts in that file.",
      );
    }
    const db = getDb();
    // ponytail: not wrapped in a transaction — SiftDatabase exposes only exec/prepare
    // (no `.transaction`), matching every other multi-row db write in this codebase
    // (see subscription.ts's replaceSubscriptions). Ceiling: if a later entry's name
    // collides with a built-in, upsertPromptByName throws after earlier entries in the
    // same pack already landed. That partial write is now made visible rather than
    // hidden: the catch below counts how many succeeded and folds that into the thrown
    // message, and the renderer's catch branch calls refresh() so the prompt list shows
    // the true post-failure state instead of going stale. It's also safe to retry —
    // upsert-by-name means re-running import after fixing the pack does not duplicate the
    // entries that already landed. Upgrade path: add `.transaction` to the SiftDatabase
    // interface (both the native and WASM drivers support it) and wrap this loop
    // if packs grow large enough for partial-apply to matter beyond this messaging.
    let imported = 0;
    let created = 0;
    let replaced = 0;
    try {
      for (const e of entries) {
        const result = upsertPromptByName(db, {
          name: e.name.trim(),
          body: e.body,
        });
        if (result.created) created++;
        else replaced++;
        imported++;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        imported > 0
          ? `${reason} (${imported} of ${entries.length} entries in this pack were already imported before this failure — fixing the pack and re-running import is safe, it won't duplicate them.)`
          : reason,
      );
    }
    return { imported, skipped, created, replaced };
  });
}
