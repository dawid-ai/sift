import { ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";
import { id, idArray, nonEmptyStr } from "./validate";
import { addTag, removeTag, listAllTags, type SiftDatabase } from "@sift/db";

/** Registers `tags:add/remove/listAll` plus the bulk pair. Errors propagate. */
export function registerTagsIpc(db: SiftDatabase): void {
  ipcMain.handle(IPC.tagsAdd, (_e, mediaId: number, name: string) =>
    addTag(db, id(mediaId, "mediaId"), nonEmptyStr(name, "name", 200)),
  );
  ipcMain.handle(IPC.tagsRemove, (_e, mediaId: number, name: string) =>
    removeTag(db, id(mediaId, "mediaId"), nonEmptyStr(name, "name", 200)),
  );
  ipcMain.handle(IPC.tagsListAll, () => listAllTags(db));

  // Bulk tagging loops the single-row accessors rather than adding a set-based INSERT. Both
  // are idempotent, the loop is what makes "how many rows changed" reportable, and a bulk
  // selection is bounded by the page size the user can select.
  ipcMain.handle(
    IPC.tagsBulkAdd,
    (_e, mediaIds: number[], name: string): number => {
      const tag = nonEmptyStr(name, "name", 200);
      let changed = 0;
      for (const mediaId of idArray(mediaIds, "mediaIds")) {
        const before = db
          .prepare<{ n: number }>(
            "SELECT COUNT(*) AS n FROM media_tag WHERE media_id = ? AND name = ?",
          )
          .get(mediaId, tag)!.n;
        addTag(db, mediaId, tag);
        if (before === 0) changed++;
      }
      return changed;
    },
  );
  ipcMain.handle(
    IPC.tagsBulkRemove,
    (_e, mediaIds: number[], name: string): void => {
      const tag = nonEmptyStr(name, "name", 200);
      for (const mediaId of idArray(mediaIds, "mediaIds"))
        removeTag(db, mediaId, tag);
    },
  );
}
