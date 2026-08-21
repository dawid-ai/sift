// Pure + dependency-free (Node-loadable under Vitest). No electron / fs / @sift/ipc-contract.
// Types are core-local (like core/transcript/types.ts); NormalizedChannelVideo is structurally
// identical to the contract's ChannelVideo, so ChannelService returns these directly.

export type ChannelContentType = "videos" | "shorts" | "live";

export interface NormalizedChannelVideo {
  externalId: string;
  url: string;
  title: string;
  durationSec: number | null;
  viewCount: number | null;
  isShort: boolean;
}

export interface NormalizedChannel {
  channelId: string;
  url: string;
  handle: string | null;
  title: string;
  description: string | null;
  uploader: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  followerCount: number | null;
  videoCount: number | null;
  newestVideoId: string | null;
}

interface RawThumb {
  url?: string;
  width?: number;
  height?: number;
  id?: string;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}
function int(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Widest thumbnail whose id/shape looks like a banner (aspect > 3:1 or id contains "banner"). */
function pickBanner(thumbs: RawThumb[]): string | null {
  const banners = thumbs.filter(
    (t) =>
      (t.id && /banner/i.test(t.id)) ||
      (typeof t.width === "number" &&
        typeof t.height === "number" &&
        t.height > 0 &&
        t.width / t.height >= 3),
  );
  const widest = banners.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return widest?.url ?? null;
}
/** Largest squarish thumbnail (avatar). */
function pickAvatar(thumbs: RawThumb[]): string | null {
  const squares = thumbs.filter(
    (t) =>
      typeof t.width === "number" &&
      typeof t.height === "number" &&
      t.height > 0 &&
      Math.abs(t.width / t.height - 1) < 0.2,
  );
  const largest = squares.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return largest?.url ?? null;
}

export function normalizeChannel(raw: unknown): NormalizedChannel {
  const r = (typeof raw === "object" && raw ? raw : {}) as Record<
    string,
    unknown
  >;
  const channelId = str(r.channel_id) ?? str(r.id);
  if (!channelId)
    throw new Error("Could not read channel — is this a channel/playlist URL?");
  const thumbs = Array.isArray(r.thumbnails)
    ? (r.thumbnails as RawThumb[])
    : [];
  const entries = Array.isArray(r.entries)
    ? (r.entries as Record<string, unknown>[])
    : [];
  const handleRaw = str(r.uploader_id) ?? str(r.channel_id_handle);
  return {
    channelId,
    url:
      str(r.channel_url) ??
      str(r.uploader_url) ??
      str(r.webpage_url) ??
      `https://www.youtube.com/channel/${channelId}`,
    handle:
      handleRaw && handleRaw.startsWith("@")
        ? handleRaw
        : handleRaw
          ? `@${handleRaw}`
          : null,
    title: str(r.channel) ?? str(r.uploader) ?? str(r.title) ?? channelId,
    description: str(r.description),
    uploader: str(r.uploader) ?? str(r.channel),
    avatarUrl: pickAvatar(thumbs),
    bannerUrl: pickBanner(thumbs),
    followerCount: int(r.channel_follower_count),
    // Only meaningful when `raw` is a real playlist — see `uploadsPlaylistUrl`.
    videoCount: int(r.playlist_count),
    newestVideoId: str(entries[0]?.id),
  };
}

/**
 * Uploads-playlist URL for a YouTube channel (`UC…` → `UU…`), or null for anything else.
 *
 * yt-dlp only reports a real `playlist_count` for a playlist. A channel URL's `playlist_count`
 * is the number of *tabs* it has (2 for most channels), and a `/videos` tab reports none at
 * all — so the uploads playlist is the only cheap source of a channel's video total.
 */
export function uploadsPlaylistUrl(channelId: string): string | null {
  return /^UC[\w-]{22}$/.test(channelId)
    ? `https://www.youtube.com/playlist?list=UU${channelId.slice(2)}`
    : null;
}

export function isShort(
  url: string,
  durationSec: number | null,
  contentType: ChannelContentType,
): boolean {
  if (contentType === "shorts") return true;
  if (contentType === "live") return false; // live/streams are long-form; duration is unreliable for in-progress streams
  if (/\/shorts\//.test(url)) return true;
  return durationSec != null && durationSec <= 60;
}

export function normalizeChannelEntries(
  raw: unknown,
  contentType: ChannelContentType,
): NormalizedChannelVideo[] {
  const r = (typeof raw === "object" && raw ? raw : {}) as Record<
    string,
    unknown
  >;
  const entries = Array.isArray(r.entries)
    ? (r.entries as Record<string, unknown>[])
    : [];
  return entries
    .map((e): NormalizedChannelVideo | null => {
      const externalId = str(e.id);
      if (!externalId) return null;
      const url = str(e.url) ?? `https://www.youtube.com/watch?v=${externalId}`;
      const durationSec = int(e.duration);
      return {
        externalId,
        url,
        title: str(e.title) ?? externalId,
        durationSec,
        viewCount: int(e.view_count),
        isShort: isShort(url, durationSec, contentType),
      };
    })
    .filter((v): v is NormalizedChannelVideo => v !== null);
}

/** New-video count: index of lastSeen in the newest-first page; pageSize if absent; 0 if null. */
export function countNewSince(
  entries: { externalId: string }[],
  lastSeenVideoId: string | null,
  pageSize: number,
): number {
  if (!lastSeenVideoId) return 0;
  const idx = entries.findIndex((e) => e.externalId === lastSeenVideoId);
  return idx === -1 ? Math.min(entries.length, pageSize) : idx;
}

export interface NormalizedSubscription {
  channelId: string;
  url: string;
  handle: string | null;
  title: string;
  avatarUrl: string | null;
  followerCount: number | null;
}

export function normalizeSubscriptions(raw: unknown): NormalizedSubscription[] {
  const r = (typeof raw === "object" && raw ? raw : {}) as Record<
    string,
    unknown
  >;
  const entries = Array.isArray(r.entries)
    ? (r.entries as Record<string, unknown>[])
    : [];
  return entries
    .map((e): NormalizedSubscription | null => {
      const channelId = str(e.id) ?? str(e.channel_id);
      if (!channelId) return null;
      const thumbs = Array.isArray(e.thumbnails)
        ? (e.thumbnails as RawThumb[])
        : [];
      const handleRaw = str(e.uploader_id) ?? str(e.channel_id_handle);
      return {
        channelId,
        url:
          str(e.url) ??
          str(e.channel_url) ??
          `https://www.youtube.com/channel/${channelId}`,
        handle: handleRaw
          ? handleRaw.startsWith("@")
            ? handleRaw
            : `@${handleRaw}`
          : null,
        title: str(e.channel) ?? str(e.title) ?? str(e.uploader) ?? channelId,
        avatarUrl: pickAvatar(thumbs),
        followerCount: int(e.channel_follower_count),
      };
    })
    .filter((s): s is NormalizedSubscription => s !== null);
}
