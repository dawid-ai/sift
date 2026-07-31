import {
  deleteChannel, getChannelByChannelId, getChannelById, getMediaById, listChannels,
  updateChannelRefresh, upsertChannel, replaceSubscriptions, listSubscriptions,
  listDownloadedSourceUrls, listQueueItems, listMediaByChannelId,
  type ChannelRow, type NewChannel, type NewSubscription, type SiftDatabase,
} from "@sift/db";
import { countNewSince, normalizeChannel, normalizeChannelEntries, normalizeSubscriptions } from "@sift/core";
import type { ChannelContentType, ChannelRecord, ChannelRefreshAllResult, ChannelVideoStatus, ChannelVideosQuery, ChannelVideosResult, DownloadedVideo, SubscriptionRecord } from "@sift/ipc-contract";
import { isAuthError } from "../auth/status";

// Node-loadable: no electron / ../paths import (Vitest under plain Node), like download-service.ts.

const REFRESH_PAGE = 30;
const POOL_CAP = 200;
const FEED_URL = "https://www.youtube.com/feed/channels";
const SUBS_POOL = 200;

function toRecord(row: ChannelRow): ChannelRecord {
  return {
    id: row.id, channelId: row.channel_id, url: row.url, handle: row.handle,
    title: row.title, description: row.description, uploader: row.uploader,
    avatarUrl: row.avatar_url, bannerUrl: row.banner_url,
    followerCount: row.follower_count, videoCount: row.video_count,
    newCount: row.new_count, lastChecked: row.last_checked, createdAt: row.created_at,
  };
}

/** Appends the wanted tab to a canonical channel URL (stripping any existing tab). */
function tabUrl(baseUrl: string, contentType: ChannelContentType): string {
  const stripped = baseUrl.replace(/\/(videos|shorts|streams)\/?$/, "");
  const tab = contentType === "live" ? "streams" : contentType;
  return `${stripped}/${tab}`;
}

export interface ChannelServiceDeps {
  db: SiftDatabase;
  runner: { flatPlaylist(url: string, opts: { items?: string }, cookiesFile?: string): Promise<unknown> };
  getCookiesFile?: (url: string) => Promise<string | null>;
  reportAuthFailure?: (url: string) => void;
}

export class ChannelService {
  constructor(private readonly deps: ChannelServiceDeps) {}

  private async flat(url: string, items?: string): Promise<unknown> {
    const cf = (await (this.deps.getCookiesFile ?? (async () => null))(url)) ?? undefined;
    try {
      return await this.deps.runner.flatPlaylist(url, items ? { items } : {}, cf);
    } catch (err) {
      if (cf && isAuthError(err instanceof Error ? err.message : String(err))) this.deps.reportAuthFailure?.(url);
      throw err;
    }
  }

  async add(url: string): Promise<ChannelRecord> {
    let raw;
    try {
      raw = await this.flat(url, "1:1");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // yt-dlp channel listing is YouTube-shaped; non-YouTube profiles (x.com, etc.) fail
      // with "Unsupported URL". Surface a clear reason instead of the raw yt-dlp dump.
      if (/unsupported url/i.test(msg)) {
        throw new Error("Only YouTube channels can be tracked. This link isn't a YouTube channel.");
      }
      throw err;
    }
    const n = normalizeChannel(raw);
    // Re-adding an already-tracked channel (e.g. via openForMedia) must NOT reset its
    // "N new" tracking. Refresh display metadata only; preserve tracking columns.
    const existing = getChannelByChannelId(this.deps.db, n.channelId);
    const nc: NewChannel = {
      channel_id: n.channelId, url: n.url, handle: n.handle, title: n.title,
      description: n.description, uploader: n.uploader, avatar_url: n.avatarUrl,
      banner_url: n.bannerUrl, follower_count: n.followerCount, video_count: n.videoCount,
      last_seen_video_id: existing ? existing.last_seen_video_id : n.newestVideoId,
      new_count: existing ? existing.new_count : 0,
      last_checked: existing ? existing.last_checked : Date.now(),
    };
    return toRecord(upsertChannel(this.deps.db, nc));
  }

  async list(): Promise<ChannelRecord[]> {
    return listChannels(this.deps.db).map(toRecord);
  }

  async remove(id: number): Promise<void> {
    deleteChannel(this.deps.db, id);
  }

  async refresh(id: number): Promise<ChannelRecord> {
    const row = getChannelById(this.deps.db, id);
    if (!row) throw new Error(`No channel with id ${id}`);
    const raw = await this.flat(tabUrl(row.url, "videos"), `1:${REFRESH_PAGE}`);
    const entries = normalizeChannelEntries(raw, "videos");
    const newCount = countNewSince(entries, row.last_seen_video_id, REFRESH_PAGE);
    const newest = entries[0]?.externalId ?? row.last_seen_video_id;
    updateChannelRefresh(this.deps.db, id, {
      last_seen_video_id: newest, new_count: newCount, last_checked: Date.now(),
    });
    return toRecord(getChannelById(this.deps.db, id)!);
  }

  async refreshAll(): Promise<ChannelRefreshAllResult> {
    const refreshed: ChannelRecord[] = [];
    const failures: { channelId: string; error: string }[] = [];
    for (const row of listChannels(this.deps.db)) {
      try {
        refreshed.push(await this.refresh(row.id));
      } catch (err) {
        failures.push({ channelId: row.channel_id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { refreshed, failures };
  }

  async listVideos(id: number, query: ChannelVideosQuery): Promise<ChannelVideosResult> {
    const row = getChannelById(this.deps.db, id);
    if (!row) throw new Error(`No channel with id ${id}`);
    const url = tabUrl(row.url, query.contentType);
    const { contentType, order, count } = query;

    if (order === "most_viewed") {
      const raw = await this.flat(url, `1:${Math.max(count, POOL_CAP)}`);
      const pool = normalizeChannelEntries(raw, contentType);
      const withViews = pool.filter((v) => v.viewCount != null);
      if (withViews.length === 0) {
        return { videos: pool.slice(0, count), viewCountsAvailable: false, order: "latest" };
      }
      const sorted = [...pool].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
      return { videos: sorted.slice(0, count), viewCountsAvailable: true, order: "most_viewed" };
    }

    const items = order === "oldest" ? `-${count}:` : `1:${count}`;
    const raw = await this.flat(url, items);
    const videos = normalizeChannelEntries(raw, contentType);
    return {
      videos: order === "oldest" ? videos.reverse() : videos,
      viewCountsAvailable: videos.some((v) => v.viewCount != null),
      order,
    };
  }

  async videoStatuses(urls: string[]): Promise<Record<string, ChannelVideoStatus>> {
    const downloaded = new Set(listDownloadedSourceUrls(this.deps.db));
    const queued = new Set(
      listQueueItems(this.deps.db)
        .filter((i) => i.status === "queued" || i.status === "running")
        .map((i) => i.source_url),
    );
    const out: Record<string, ChannelVideoStatus> = {};
    for (const u of urls) {
      if (downloaded.has(u)) out[u] = "downloaded";
      else if (queued.has(u)) out[u] = "queued";
    }
    return out;
  }

  async channelUrlForMedia(mediaId: number): Promise<string> {
    const media = getMediaById(this.deps.db, mediaId);
    if (!media) throw new Error(`No media with id ${mediaId}`);
    let fromRaw: string | null = null;
    if (media.metadata_json) {
      try {
        const raw = JSON.parse(media.metadata_json) as Record<string, unknown>;
        const cu = raw.channel_url ?? raw.uploader_url;
        if (typeof cu === "string" && cu) fromRaw = cu;
      } catch { /* fall through to uploader_url */ }
    }
    const url = fromRaw ?? media.uploader_url;
    if (!url) throw new Error("This video has no channel link.");
    return url;
  }

  async openForMedia(mediaId: number): Promise<ChannelRecord> {
    return this.add(await this.channelUrlForMedia(mediaId));
  }

  /** Library media downloaded/transcribed from this channel (matched on channel_id), newest first. */
  async downloadedMedia(channelId: string): Promise<DownloadedVideo[]> {
    return listMediaByChannelId(this.deps.db, channelId).map((m) => ({
      id: m.id,
      title: m.title,
      thumbnailUrl: m.thumbnail_path,
      createdAt: m.created_at,
    }));
  }

  async syncSubscriptions(): Promise<SubscriptionRecord[]> {
    const raw = await this.flat(FEED_URL, `1:${SUBS_POOL}`);
    const now = Date.now();
    const rows: NewSubscription[] = normalizeSubscriptions(raw).map((s) => ({
      channel_id: s.channelId, url: s.url, handle: s.handle, title: s.title,
      avatar_url: s.avatarUrl, follower_count: s.followerCount, synced_at: now,
    }));
    // don't wipe the cached list on an empty fetch (signed-out yt-dlp can
    // return {entries:[]} instead of throwing). A truly-unsubscribed-from-all user
    // keeps a stale list until a non-empty sync; acceptable for re-syncable cache data.
    if (rows.length > 0) replaceSubscriptions(this.deps.db, rows);
    return this.listSubscriptions();
  }

  async listSubscriptions(): Promise<SubscriptionRecord[]> {
    const tracked = new Set(listChannels(this.deps.db).map((c) => c.channel_id));
    return listSubscriptions(this.deps.db).map((r) => ({
      id: r.id, channelId: r.channel_id, url: r.url, handle: r.handle, title: r.title,
      avatarUrl: r.avatar_url, followerCount: r.follower_count, syncedAt: r.synced_at,
      tracked: tracked.has(r.channel_id),
    }));
  }
}
