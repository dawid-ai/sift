import { ipcMain, shell } from "electron";
import { IPC } from "@sift/ipc-contract";
import type { MediaFilter } from "@sift/ipc-contract";
import type { DownloadService } from "../services/download-service";

/** Registers the `library:*` handlers (list/reveal/remove/detail/remove{Download,Transcript,Summary}/openExternal/search/exportPlaylist). Errors propagate. */
export function registerLibraryIpc(service: DownloadService): void {
  ipcMain.handle(IPC.libraryList, () => service.list());
  ipcMain.handle(
    IPC.libraryListPage,
    (_e, filter: MediaFilter, page: number, pageSize: number) =>
      service.listPage(filter, page, pageSize),
  );
  ipcMain.handle(IPC.libraryFacets, () => service.facets());
  ipcMain.handle(IPC.libraryListIds, (_e, filter: MediaFilter) =>
    service.listIds(filter),
  );
  ipcMain.handle(IPC.libraryReveal, (_event, path: string) => {
    shell.showItemInFolder(path);
  });
  ipcMain.handle(IPC.libraryRemove, (_e, id: number) => service.remove(id));
  ipcMain.handle(IPC.libraryDetail, (_e, id: number) => service.detail(id));
  ipcMain.handle(IPC.libraryRemoveDownload, (_e, id: number) =>
    service.removeDownload(id),
  );
  ipcMain.handle(IPC.libraryRemoveTranscript, (_e, id: number) =>
    service.removeTranscript(id),
  );
  ipcMain.handle(IPC.libraryRemoveSummary, (_e, id: number) =>
    service.removeSummary(id),
  );
  ipcMain.handle(IPC.libraryOpenExternal, (_e, url: string) =>
    shell.openExternal(url),
  );
  ipcMain.handle(
    IPC.librarySearch,
    (_e, query: string, includeText?: boolean) =>
      service.search(query, includeText ?? false),
  );
  ipcMain.handle(
    IPC.libraryExportPlaylist,
    (_e, mediaIds: number[], name: string) =>
      service.exportPlaylist(mediaIds, name),
  );
}
