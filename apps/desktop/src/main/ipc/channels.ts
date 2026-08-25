import { ipcMain } from "electron";
import { IPC, type ChannelVideosQuery } from "@sift/ipc-contract";
import type { ChannelService } from "../services/channel-service";
import { httpUrl, id, nonEmptyStr, strArray } from "./validate";
import { channelVideosQuery } from "./validate-payloads";

/** Registers channel request handlers. Errors propagate (rejected invoke in the renderer). */
export function registerChannelsIpc(service: ChannelService): void {
  ipcMain.handle(IPC.channelAdd, (_e, url: string) =>
    service.add(httpUrl(url, "url")),
  );
  ipcMain.handle(IPC.channelList, () => service.list());
  ipcMain.handle(IPC.channelRemove, (_e, channelRowId: number) =>
    service.remove(id(channelRowId, "id")),
  );
  ipcMain.handle(IPC.channelRefresh, (_e, channelRowId: number) =>
    service.refresh(id(channelRowId, "id")),
  );
  ipcMain.handle(IPC.channelRefreshAll, () => service.refreshAll());
  ipcMain.handle(
    IPC.channelListVideos,
    (_e, channelRowId: number, query: ChannelVideosQuery) =>
      service.listVideos(id(channelRowId, "id"), channelVideosQuery(query)),
  );
  ipcMain.handle(IPC.channelOpenForMedia, (_e, mediaId: number) =>
    service.openForMedia(id(mediaId, "mediaId")),
  );
  ipcMain.handle(IPC.channelVideoStatuses, (_e, urls: string[]) =>
    service.videoStatuses(strArray(urls, "urls", 5000, 4096)),
  );
  ipcMain.handle(IPC.channelDownloadedMedia, (_e, channelId: string) =>
    service.downloadedMedia(nonEmptyStr(channelId, "channelId", 200)),
  );
  ipcMain.handle(IPC.subscriptionList, () => service.listSubscriptions());
  ipcMain.handle(IPC.subscriptionSync, () => service.syncSubscriptions());
}
