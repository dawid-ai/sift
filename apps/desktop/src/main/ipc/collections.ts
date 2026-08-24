import { ipcMain } from "electron";
import { IPC, type MediaFilter } from "@sift/ipc-contract";
import {
  addToCollection,
  collectionsForMedia,
  createCollection,
  deleteCollection,
  deleteSavedSearch,
  listCollections,
  listSavedSearches,
  removeFromCollection,
  renameCollection,
  saveSearch,
  type SiftDatabase,
} from "@sift/db";
import { id, idArray, nonEmptyStr, str } from "./validate";
import { mediaFilter } from "./validate-payloads";

/** Registers `collections:*` and `savedSearches:*`. Errors propagate. */
export function registerCollectionsIpc(getDb: () => SiftDatabase): void {
  const NAME_MAX = 120;

  ipcMain.handle(IPC.collectionsList, () => listCollections(getDb()));
  ipcMain.handle(IPC.collectionsCreate, (_e, name: string) => {
    createCollection(getDb(), nonEmptyStr(name, "name", NAME_MAX));
    // The row alone lacks the count the sidebar renders, so return the listed shape.
    const created = listCollections(getDb()).find(
      (c) => c.name.toLowerCase() === name.trim().toLowerCase(),
    );
    if (!created) throw new Error("Failed to create the collection.");
    return created;
  });
  ipcMain.handle(IPC.collectionsRename, (_e, cid: number, name: string) =>
    renameCollection(
      getDb(),
      id(cid, "id"),
      nonEmptyStr(name, "name", NAME_MAX),
    ),
  );
  ipcMain.handle(IPC.collectionsDelete, (_e, cid: number) =>
    deleteCollection(getDb(), id(cid, "id")),
  );
  ipcMain.handle(IPC.collectionsAdd, (_e, cid: number, mediaIds: number[]) =>
    addToCollection(getDb(), id(cid, "id"), idArray(mediaIds, "mediaIds")),
  );
  ipcMain.handle(IPC.collectionsRemove, (_e, cid: number, mediaIds: number[]) =>
    removeFromCollection(getDb(), id(cid, "id"), idArray(mediaIds, "mediaIds")),
  );
  ipcMain.handle(IPC.collectionsForMedia, (_e, mediaId: number) =>
    collectionsForMedia(getDb(), id(mediaId, "mediaId")),
  );

  ipcMain.handle(IPC.savedSearchesList, () => listSavedSearches(getDb()));
  ipcMain.handle(
    IPC.savedSearchesSave,
    (_e, name: string, query: string, filter: MediaFilter) =>
      saveSearch(getDb(), {
        name: nonEmptyStr(name, "name", NAME_MAX),
        query: str(query, "query", 1024),
        filter: mediaFilter(filter),
      }),
  );
  ipcMain.handle(IPC.savedSearchesDelete, (_e, sid: number) =>
    deleteSavedSearch(getDb(), id(sid, "id")),
  );
}
