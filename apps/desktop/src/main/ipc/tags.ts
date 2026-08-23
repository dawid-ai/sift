import { ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";
import { id, nonEmptyStr } from "./validate";
import { addTag, removeTag, listAllTags, type SiftDatabase } from "@sift/db";

/** Registers `tags:add/remove/listAll`. Errors propagate. */
export function registerTagsIpc(db: SiftDatabase): void {
  ipcMain.handle(IPC.tagsAdd, (_e, mediaId: number, name: string) =>
    addTag(db, id(mediaId, "mediaId"), nonEmptyStr(name, "name", 200)),
  );
  ipcMain.handle(IPC.tagsRemove, (_e, mediaId: number, name: string) =>
    removeTag(db, id(mediaId, "mediaId"), nonEmptyStr(name, "name", 200)),
  );
  ipcMain.handle(IPC.tagsListAll, () => listAllTags(db));
}
