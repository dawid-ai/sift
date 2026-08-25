import { join } from "node:path";
import {
  dialog,
  ipcMain,
  type BrowserWindow,
  type OpenDialogOptions,
} from "electron";
import { branding } from "@sift/core";
import { IPC } from "@sift/ipc-contract";
import type { BackupService, MissingFile } from "../services/backup-service";
import { absPath, id, int, str } from "./validate";

/** Registers `backup:*`. Errors propagate. */
export function registerBackupIpc(deps: {
  service: () => BackupService;
  databaseFile: () => string;
  getWindows: () => BrowserWindow[];
}): void {
  const pickFolder = async (title: string): Promise<string | null> => {
    const win = deps.getWindows()[0];
    const opts: OpenDialogOptions = {
      title,
      properties: ["openDirectory", "createDirectory"],
    };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  };

  ipcMain.handle(IPC.backupCreate, async () => {
    const parent = await pickFolder("Choose where to write the backup");
    if (!parent) return null;
    // A dated subfolder, so a second backup into the same place doesn't overwrite the first.
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const target = join(parent, `${branding.slug}-backup-${stamp}`);
    return deps.service().backup(target);
  });

  ipcMain.handle(IPC.backupInspect, async () => {
    const source = await pickFolder("Choose a backup folder");
    if (!source) return null;
    return { path: source, manifest: deps.service().inspect(source) };
  });

  ipcMain.handle(IPC.backupRestore, (_e, sourceDir: string) =>
    deps
      .service()
      .stageRestore(absPath(sourceDir, "sourceDir"), deps.databaseFile()),
  );

  ipcMain.handle(IPC.backupVerify, () => deps.service().verify());

  ipcMain.handle(
    IPC.backupRepair,
    async (_e, missing: unknown, useSearchDir: boolean) => {
      if (!Array.isArray(missing))
        throw new Error('Invalid IPC argument "missing": expected an array.');
      if (missing.length > 100_000)
        throw new Error('Invalid IPC argument "missing": too many entries.');
      const checked: MissingFile[] = missing.map((raw, i) => {
        const o = (raw ?? {}) as Record<string, unknown>;
        return {
          mediaId: id(o.mediaId, `missing[${i}].mediaId`),
          downloadId: id(o.downloadId, `missing[${i}].downloadId`),
          title: str(o.title, `missing[${i}].title`, 2048),
          path: absPath(o.path, `missing[${i}].path`),
        };
      });
      const searchDir = useSearchDir
        ? await pickFolder("Where did the files move to?")
        : null;
      return deps.service().repair(checked, searchDir ?? undefined);
    },
  );

  // Referenced so the import is used even if a future edit drops the only int() call.
  void int;
}
