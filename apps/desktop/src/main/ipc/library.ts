import { ipcMain, shell } from "electron";
import { IPC } from "@sift/ipc-contract";
import type { MediaFilter } from "@sift/ipc-contract";
import type { DownloadService } from "../services/download-service";
import { absPath, bool, httpUrl, id, idArray, int, str } from "./validate";
import {
  findDuplicates,
  setFavourite,
  setPinned,
  type SiftDatabase,
} from "@sift/db";
import { mediaFilter } from "./validate-payloads";

/** Registers the `library:*` handlers (list/reveal/remove/detail/remove{Download,Transcript,Summary}/openExternal/search/exportPlaylist). Errors propagate. */
export function registerLibraryIpc(
  service: DownloadService,
  getDb: () => SiftDatabase,
): void {
  ipcMain.handle(IPC.libraryList, () => service.list());
  ipcMain.handle(
    IPC.libraryListPage,
    (_e, filter: MediaFilter, page: number, pageSize: number) =>
      service.listPage(
        mediaFilter(filter),
        int(page, "page", 0, 1_000_000),
        int(pageSize, "pageSize", 1, 1000),
      ),
  );
  ipcMain.handle(IPC.libraryFacets, () => service.facets());
  ipcMain.handle(IPC.libraryListIds, (_e, filter: MediaFilter) =>
    service.listIds(mediaFilter(filter)),
  );
  ipcMain.handle(IPC.libraryReveal, (_event, path: string) => {
    // showItemInFolder only selects a file in the OS file manager, but the argument
    // still comes from the renderer — keep it to a well-formed absolute path.
    shell.showItemInFolder(absPath(path, "path"));
  });
  ipcMain.handle(IPC.libraryRemove, (_e, mediaId: number) =>
    service.remove(id(mediaId, "mediaId")),
  );
  ipcMain.handle(IPC.libraryDetail, (_e, mediaId: number) =>
    service.detail(id(mediaId, "mediaId")),
  );
  ipcMain.handle(IPC.libraryRemoveDownload, (_e, mediaId: number) =>
    service.removeDownload(id(mediaId, "mediaId")),
  );
  ipcMain.handle(IPC.libraryRemoveTranscript, (_e, mediaId: number) =>
    service.removeTranscript(id(mediaId, "mediaId")),
  );
  ipcMain.handle(IPC.libraryRemoveSummary, (_e, mediaId: number) =>
    service.removeSummary(id(mediaId, "mediaId")),
  );
  ipcMain.handle(IPC.libraryOpenExternal, (_e, url: string) =>
    // SECURITY: openExternal hands the argument to the OS, which will launch whatever
    // application claims the scheme. Renderer-side validation is not a boundary, so the
    // http(s) check is repeated here.
    shell.openExternal(httpUrl(url, "url")),
  );
  ipcMain.handle(
    IPC.librarySearch,
    (_e, query: string, includeText?: boolean) =>
      service.search(
        str(query, "query", 1024),
        bool(includeText ?? false, "includeText"),
      ),
  );
  ipcMain.handle(IPC.libraryFindDuplicates, () => findDuplicates(getDb()));
  ipcMain.handle(
    IPC.librarySetFavourite,
    (_e, mediaId: number, favourite: boolean) =>
      setFavourite(
        getDb(),
        id(mediaId, "mediaId"),
        bool(favourite, "favourite"),
      ),
  );
  ipcMain.handle(IPC.librarySetPinned, (_e, mediaId: number, pinned: boolean) =>
    setPinned(getDb(), id(mediaId, "mediaId"), bool(pinned, "pinned")),
  );
  ipcMain.handle(IPC.libraryBulkRemove, (_e, mediaIds: number[]) =>
    service.bulkRemove(idArray(mediaIds, "mediaIds")),
  );
  ipcMain.handle(
    IPC.libraryExportPlaylist,
    (_e, mediaIds: number[], name: string) =>
      service.exportPlaylist(
        idArray(mediaIds, "mediaIds"),
        str(name, "name", 200),
      ),
  );
}
