import { ipcMain } from "electron";
import { IPC, type ChannelVideosQuery } from "@sift/ipc-contract";
import type { ChannelService } from "../services/channel-service";

/** Registers channel request handlers. Errors propagate (rejected invoke in the renderer). */
export function registerChannelsIpc(service: ChannelService): void {
  ipcMain.handle(IPC.channelAdd, (_e, url: string) => service.add(url));
  ipcMain.handle(IPC.channelList, () => service.list());
  ipcMain.handle(IPC.channelRemove, (_e, id: number) => service.remove(id));
  ipcMain.handle(IPC.channelRefresh, (_e, id: number) => service.refresh(id));
  ipcMain.handle(IPC.channelRefreshAll, () => service.refreshAll());
  ipcMain.handle(
    IPC.channelListVideos,
    (_e, id: number, query: ChannelVideosQuery) =>
      service.listVideos(id, query),
  );
  ipcMain.handle(IPC.channelOpenForMedia, (_e, mediaId: number) =>
    service.openForMedia(mediaId),
  );
  ipcMain.handle(IPC.channelVideoStatuses, (_e, urls: string[]) =>
    service.videoStatuses(urls),
  );
  ipcMain.handle(IPC.channelDownloadedMedia, (_e, channelId: string) =>
    service.downloadedMedia(channelId),
  );
  ipcMain.handle(IPC.subscriptionList, () => service.listSubscriptions());
  ipcMain.handle(IPC.subscriptionSync, () => service.syncSubscriptions());
}
