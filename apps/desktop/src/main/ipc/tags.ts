import { ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";
import { addTag, removeTag, listAllTags, type SiftDatabase } from "@sift/db";

/** Registers `tags:add/remove/listAll`. Errors propagate. */
export function registerTagsIpc(db: SiftDatabase): void {
  ipcMain.handle(IPC.tagsAdd, (_e, mediaId: number, name: string) => addTag(db, mediaId, name));
  ipcMain.handle(IPC.tagsRemove, (_e, mediaId: number, name: string) => removeTag(db, mediaId, name));
  ipcMain.handle(IPC.tagsListAll, () => listAllTags(db));
}
