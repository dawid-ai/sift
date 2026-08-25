import { readFileSync, writeFileSync } from "node:fs";
import {
  dialog,
  ipcMain,
  type BrowserWindow,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from "electron";
import { branding } from "@sift/core";
import { IPC, type PromptPackEntry } from "@sift/ipc-contract";
import { listPrompts, upsertPromptByName, type SiftDatabase } from "@sift/db";
import {
  applySettings,
  buildProfile,
  parseProfile,
  validPromptEntries,
  type ProfileImportResult,
  type ProfileSlot,
} from "../services/profile";

/**
 * Registers `profile:export` + `profile:import` — one file carrying every non-secret setting
 * plus the user's own prompts, so a second machine (or a reinstall) starts configured.
 *
 * Errors propagate so `ipcMain.handle` rejects the renderer's `invoke()`.
 */
export function registerProfileIpc(deps: {
  slots: () => ProfileSlot[];
  getDb: () => SiftDatabase;
  getWindows: () => BrowserWindow[];
  now?: () => string;
}): void {
  const now = deps.now ?? (() => new Date().toISOString());

  ipcMain.handle(IPC.profileExport, async (): Promise<string | null> => {
    const prompts: PromptPackEntry[] = listPrompts(deps.getDb())
      .filter((p) => p.is_builtin === 0)
      .map((p) => ({ name: p.name, body: p.body }));
    const profile = buildProfile(deps.slots(), prompts, now());
    const win = deps.getWindows()[0];
    const opts: SaveDialogOptions = {
      title: "Export settings profile",
      defaultPath: `${branding.slug}-profile.json`,
      filters: [{ name: "Profile", extensions: ["json"] }],
    };
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, opts)
      : await dialog.showSaveDialog(opts);
    if (canceled || !filePath) return null;
    writeFileSync(filePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
    return filePath;
  });

  ipcMain.handle(
    IPC.profileImport,
    async (): Promise<ProfileImportResult | null> => {
      const win = deps.getWindows()[0];
      const opts: OpenDialogOptions = {
        title: "Import settings profile",
        properties: ["openFile"],
        filters: [{ name: "Profile", extensions: ["json"] }],
      };
      const { canceled, filePaths } = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts);
      const file = filePaths[0];
      if (canceled || !file) return null;

      const profile = parseProfile(readFileSync(file, "utf8"));
      const { applied, skipped } = applySettings(profile, deps.slots());
      const { entries, skipped: promptsSkipped } = validPromptEntries(
        profile.prompts,
      );

      // Same upsert-by-name as the prompt-pack import, and the same ceiling: no transaction,
      // so a name colliding with a built-in throws partway through. Settings are already
      // applied by then, which is why the counts below are returned rather than a bare "ok".
      let promptsCreated = 0;
      let promptsReplaced = 0;
      const db = deps.getDb();
      try {
        for (const e of entries) {
          const result = upsertPromptByName(db, {
            name: e.name.trim(),
            body: e.body,
          });
          if (result.created) promptsCreated++;
          else promptsReplaced++;
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(
          `${reason} (${applied.length} settings and ${promptsCreated + promptsReplaced} of ${entries.length} prompts were already applied — re-running import after fixing the file is safe.)`,
        );
      }
      return {
        applied,
        skipped,
        promptsCreated,
        promptsReplaced,
        promptsSkipped,
      };
    },
  );
}
