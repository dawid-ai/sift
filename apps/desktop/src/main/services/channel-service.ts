import {
  deleteChannel,
  getChannelByChannelId,
  getChannelById,
  getMediaById,
  listChannels,
  updateChannelRefresh,
  upsertChannel,
  replaceSubscriptions,
  listSubscriptions,
  listDownloadedSourceUrls,
  listQueueItems,
  listMediaByChannelId,
  upsertChannelVideos,
  listChannelVideos,
  listChannelViewCounts,
  setChannelStatsSynced,
  type ChannelRow,
  type NewChannel,
  type NewSubscription,
  type SiftDatabase,
} from "@sift/db";
import {
  countNewSince,
  medianViews,
  normalizeChannel,
  normalizeChannelEntries,
  normalizeSubscriptions,
  uploadsPlaylistUrl,
} from "@sift/core";
import type {
  ChannelContentType,
  ChannelRecord,
  ChannelRefreshAllResult,
  ChannelStatsResult,
  ChannelVideo,
  ChannelVideoStatus,
  ChannelVideosQuery,
  ChannelVideosResult,
  DownloadedVideo,
  SubscriptionRecord,
} from "@sift/ipc-contract";
import { isAuthError } from "../auth/status";

// Node-loadable: no electron / ../paths import (Vitest under plain Node), like download-service.ts.

const REFRESH_PAGE = 30;
const POOL_CAP = 200;
// yt-dlp caps at the channel's real length, so 1:100000 means "every video".
const CATALOG_CAP = 100000;
const CONTENT_TABS: ChannelContentType[] = ["videos", "shorts", "live"];
const FEED_URL = "https://www.youtube.com/feed/channels";
const SUBS_POOL = 200;

function toRecord(row: ChannelRow): ChannelRecord {
  return {
    id: row.id,
    channelId: row.channel_id,
    url: row.url,
    handle: row.handle,
    title: row.title,
    description: row.description,
    uploader: row.uploader,
    avatarUrl: row.avatar_url,
    bannerUrl: row.banner_url,
    followerCount: row.follower_count,
    videoCount: row.video_count,
    newCount: row.new_count,
    lastChecked: row.last_checked,
    statsSyncedAt: row.stats_synced_at,
    createdAt: row.created_at,
  };
}

/** Subscriber count off a raw yt-dlp channel/tab dump. Every listing carries it, so a
 * refresh keeps the number current without a second fetch. */
function followerCount(raw: unknown): number | null {
  const r = (typeof raw === "object" && raw ? raw : {}) as {
    channel_follower_count?: unknown;
  };
  return typeof r.channel_follower_count === "number"
    ? r.channel_follower_count
    : null;
}

/** Appends the wanted tab to a canonical channel URL (stripping any existing tab). */
function tabUrl(baseUrl: string, contentType: ChannelContentType): string {
  const stripped = baseUrl.replace(/\/(videos|shorts|streams)\/?$/, "");
  const tab = contentType === "live" ? "streams" : contentType;
  return `${stripped}/${tab}`;
}

export interface ChannelServiceDeps {
  db: SiftDatabase;
  runner: {
    flatPlaylist(
      url: string,
      opts: { items?: string },
      cookiesFile?: string,
    ): Promise<unknown>;
  };
  getCookiesFile?: (url: string) => Promise<string | null>;
  reportAuthFailure?: (url: string) => void;
}

export class ChannelService {
  constructor(private readonly deps: ChannelServiceDeps) {}

  private async flat(url: string, items?: string): Promise<unknown> {
    const cf =
      (await (this.deps.getCookiesFile ?? (async () => null))(url)) ??
      undefined;
    try {
      return await this.deps.runner.flatPlaylist(
        url,
        items ? { items } : {},
        cf,
      );
    } catch (err) {
      if (cf && isAuthError(err instanceof Error ? err.message : String(err)))
        this.deps.reportAuthFailure?.(url);
      throw err;
    }
  }

  /**
   * The channel's real video total, or null when it can't be read.
   *
   * yt-dlp reports `playlist_count` for playlists only: the channel URL we fetch in `add`
   * answers with its *tab* count (2), which is why every channel used to show "Videos 2".
   * The uploads playlist has the true number. Failure is non-fatal — the stat renders as an
   * em dash rather than blocking an add or a refresh.
   */
  private async uploadsCount(channelId: string): Promise<number | null> {
    const url = uploadsPlaylistUrl(channelId);
    if (!url) return null;
    try {
      const raw = (await this.flat(url, "1:1")) as { playlist_count?: unknown };
      return typeof raw?.playlist_count === "number"
        ? raw.playlist_count
        : null;
    } catch {
      return null;
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
        throw new Error(
          "Only YouTube channels can be tracked. This link isn't a YouTube channel.",
        );
      }
      throw err;
    }
    const n = normalizeChannel(raw);
    // Re-adding an already-tracked channel (e.g. via openForMedia) must NOT reset its
    // "N new" tracking. Refresh display metadata only; preserve tracking columns.
    const existing = getChannelByChannelId(this.deps.db, n.channelId);
    // A non-YouTube-channel URL (a plain playlist) keeps the count normalize read off it.
    const videoCount =
      uploadsPlaylistUrl(n.channelId) === null
        ? n.videoCount
        : ((await this.uploadsCount(n.channelId)) ??
          existing?.video_count ??
          null);
    const nc: NewChannel = {
      channel_id: n.channelId,
      url: n.url,
      handle: n.handle,
      title: n.title,
      description: n.description,
      uploader: n.uploader,
      avatar_url: n.avatarUrl,
      banner_url: n.bannerUrl,
      follower_count: n.followerCount,
      video_count: videoCount,
      last_seen_video_id: existing
        ? existing.last_seen_video_id
        : n.newestVideoId,
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
    const newCount = countNewSince(
      entries,
      row.last_seen_video_id,
      REFRESH_PAGE,
    );
    const newest = entries[0]?.externalId ?? row.last_seen_video_id;
    updateChannelRefresh(this.deps.db, id, {
      last_seen_video_id: newest,
      new_count: newCount,
      video_count: (await this.uploadsCount(row.channel_id)) ?? row.video_count,
      follower_count: followerCount(raw) ?? row.follower_count,
      last_checked: Date.now(),
    });
    return toRecord(getChannelById(this.deps.db, id)!);
  }

  /**
   * Pulls every video of every content tab and stores its stats.
   *
   * This is the baseline outlier scoring needs: without it a video is compared against the
   * median of the page the UI happened to fetch (25 by default), so "2x the median" says
   * more about the page than about the channel. One yt-dlp call per tab, so it is a manual
   * action rather than something the refresh scheduler runs.
   *
   * A tab that fails (no /shorts, no /streams, a private channel) is recorded in `failures`
   * and the others still land. All three failing throws — nothing was synced.
   */
  async syncStats(id: number): Promise<ChannelStatsResult> {
    const row = getChannelById(this.deps.db, id);
    if (!row) throw new Error(`No channel with id ${id}`);
    const now = Date.now();
    const counts: Record<ChannelContentType, number> = {
      videos: 0,
      shorts: 0,
      live: 0,
    };
    const failures: { contentType: ChannelContentType; error: string }[] = [];
    let followers: number | null = null;

    for (const contentType of CONTENT_TABS) {
      try {
        const raw = await this.flat(
          tabUrl(row.url, contentType),
          `1:${CATALOG_CAP}`,
        );
        followers ??= followerCount(raw);
        counts[contentType] = upsertChannelVideos(
          this.deps.db,
          row.channel_id,
          contentType,
          normalizeChannelEntries(raw, contentType).map((v) => ({
            external_id: v.externalId,
            url: v.url,
            title: v.title,
            duration_s: v.durationSec,
            view_count: v.viewCount,
            is_short: v.isShort ? 1 : 0,
          })),
          now,
        );
      } catch (err) {
        failures.push({
          contentType,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (failures.length === CONTENT_TABS.length)
      throw new Error(failures[0]!.error);

    // Channel-level stats are free on this pass — the tab dump carries the subscriber count,
    // and the uploads playlist has the real video total. Tracking columns are left alone so a
    // stats sync never clears an unread "N new" badge.
    updateChannelRefresh(this.deps.db, id, {
      last_seen_video_id: row.last_seen_video_id,
      new_count: row.new_count,
      video_count: (await this.uploadsCount(row.channel_id)) ?? row.video_count,
      follower_count: followers ?? row.follower_count,
      last_checked: now,
    });
    setChannelStatsSynced(this.deps.db, id, now);
    return {
      channel: toRecord(getChannelById(this.deps.db, id)!),
      counts,
      failures,
    };
  }

  async refreshAll(): Promise<ChannelRefreshAllResult> {
    const refreshed: ChannelRecord[] = [];
    const failures: { channelId: string; error: string }[] = [];
    for (const row of listChannels(this.deps.db)) {
      try {
        refreshed.push(await this.refresh(row.id));
      } catch (err) {
        failures.push({
          channelId: row.channel_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { refreshed, failures };
  }

  /** Median views across the stored catalogue for one tab, or null when it is empty. */
  private catalogMedian(
    channelId: string,
    contentType: ChannelContentType,
  ): number | null {
    const counts = listChannelViewCounts(this.deps.db, channelId, contentType);
    return counts.length === 0
      ? null
      : medianViews(counts.map((c) => ({ viewCount: c })));
  }

  async listVideos(
    id: number,
    query: ChannelVideosQuery,
  ): Promise<ChannelVideosResult> {
    const row = getChannelById(this.deps.db, id);
    if (!row) throw new Error(`No channel with id ${id}`);
    const url = tabUrl(row.url, query.contentType);
    const { contentType, order, count } = query;

    // Once the catalogue is synced it IS the channel: serving from it makes "Most viewed"
    // a true full-catalogue sort instead of a sort over a 200-video pool, makes "All videos"
    // instant, and scores outliers against every video rather than the page.
    const catalog = listChannelVideos(
      this.deps.db,
      row.channel_id,
      contentType,
    );
    if (catalog.length > 0) {
      const videos: ChannelVideo[] = catalog.map((r) => ({
        externalId: r.external_id,
        url: r.url,
        title: r.title,
        durationSec: r.duration_s,
        viewCount: r.view_count,
        isShort: r.is_short === 1,
      }));
      const viewCountsAvailable = videos.some((v) => v.viewCount != null);
      // `position` is newest-first, so "oldest" is that order reversed. There is no upload
      // date in a flat listing — see packages/core/src/channel/outlier.ts.
      const effective =
        order === "most_viewed" && !viewCountsAvailable ? "latest" : order;
      const sorted =
        effective === "most_viewed"
          ? [...videos].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
          : effective === "oldest"
            ? [...videos].reverse()
            : videos;
      return {
        videos: sorted.slice(0, count),
        viewCountsAvailable,
        order: effective,
        median: this.catalogMedian(row.channel_id, contentType),
        source: "catalog",
        catalogSize: catalog.length,
      };
    }

    if (order === "most_viewed") {
      const raw = await this.flat(url, `1:${Math.max(count, POOL_CAP)}`);
      const pool = normalizeChannelEntries(raw, contentType);
      const withViews = pool.filter((v) => v.viewCount != null);
      if (withViews.length === 0) {
        return {
          videos: pool.slice(0, count),
          viewCountsAvailable: false,
          order: "latest",
          median: null,
          source: "live",
          catalogSize: 0,
        };
      }
      const sorted = [...pool].sort(
        (a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0),
      );
      return {
        videos: sorted.slice(0, count),
        viewCountsAvailable: true,
        order: "most_viewed",
        median: medianViews(pool),
        source: "live",
        catalogSize: 0,
      };
    }

    const items = order === "oldest" ? `-${count}:` : `1:${count}`;
    const raw = await this.flat(url, items);
    const videos = normalizeChannelEntries(raw, contentType);
    return {
      videos: order === "oldest" ? videos.reverse() : videos,
      viewCountsAvailable: videos.some((v) => v.viewCount != null),
      order,
      median: medianViews(videos),
      source: "live",
      catalogSize: 0,
    };
  }

  async videoStatuses(
    urls: string[],
  ): Promise<Record<string, ChannelVideoStatus>> {
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
      } catch {
        /* fall through to uploader_url */
      }
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
      channel_id: s.channelId,
      url: s.url,
      handle: s.handle,
      title: s.title,
      avatar_url: s.avatarUrl,
      follower_count: s.followerCount,
      synced_at: now,
    }));
    // don't wipe the cached list on an empty fetch (signed-out yt-dlp can
    // return {entries:[]} instead of throwing). A truly-unsubscribed-from-all user
    // keeps a stale list until a non-empty sync; acceptable for re-syncable cache data.
    if (rows.length > 0) replaceSubscriptions(this.deps.db, rows);
    return this.listSubscriptions();
  }

  async listSubscriptions(): Promise<SubscriptionRecord[]> {
    const tracked = new Set(
      listChannels(this.deps.db).map((c) => c.channel_id),
    );
    return listSubscriptions(this.deps.db).map((r) => ({
      id: r.id,
      channelId: r.channel_id,
      url: r.url,
      handle: r.handle,
      title: r.title,
      avatarUrl: r.avatar_url,
      followerCount: r.follower_count,
      syncedAt: r.synced_at,
      tracked: tracked.has(r.channel_id),
    }));
  }
}
