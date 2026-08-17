import { beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDatabase } from "@sift/db/testing";
import {
  runMigrations,
  insertMedia,
  insertDownload,
  insertQueueItem,
  upsertChannel,
  upsertSubscription,
  listSubscriptions,
  type SiftDatabase,
} from "@sift/db";
import { ChannelService, type ChannelServiceDeps } from "./channel-service";

function channelRaw(
  entries: { id: string; view_count?: number; duration?: number }[],
) {
  return {
    channel_id: "UC1",
    channel: "Chan",
    uploader_id: "@chan",
    channel_follower_count: 10,
    playlist_count: 100,
    thumbnails: [],
    entries: entries.map((e) => ({
      ...e,
      url: `https://www.youtube.com/watch?v=${e.id}`,
      title: e.id,
    })),
  };
}

function makeDeps(
  db: SiftDatabase,
  flat: (url: string, opts: { items?: string }) => Promise<unknown>,
): ChannelServiceDeps {
  return { db, runner: { flatPlaylist: vi.fn(flat) } };
}

describe("ChannelService", () => {
  let db: SiftDatabase;
  beforeEach(async () => {
    db = await openTestDatabase();
    runMigrations(db);
  });

  it("videoStatuses flags downloaded and queued videos, leaves the rest absent", async () => {
    const svc = new ChannelService(makeDeps(db, async () => ({})));
    const dl = "https://www.youtube.com/watch?v=DL";
    const q = "https://www.youtube.com/watch?v=Q";
    const none = "https://www.youtube.com/watch?v=N";
    const m = insertMedia(db, {
      source_url: dl,
      platform_id: "youtube",
      external_id: "DL",
      title: "t",
      uploader: null,
      uploader_url: null,
      duration_s: null,
      thumbnail_path: null,
      view_count: null,
      like_count: null,
      published_at: null,
      metadata_json: null,
      download_status: "done",
    });
    insertDownload(db, {
      media_id: m.id,
      format_id: "137",
      label: "1080p",
      ext: "mp4",
      height: 1080,
      file_path: "/x.mp4",
      file_size: null,
      status: "done",
      error: null,
    });
    insertQueueItem(db, {
      source_url: q,
      spec_json: "{}",
      status: "queued",
      ops_json: null,
      media_id: null,
      queue_order: 1,
      error: null,
    });
    const out = await svc.videoStatuses([dl, q, none]);
    expect(out).toEqual({ [dl]: "downloaded", [q]: "queued" });
  });

  it("add upserts by channel_id (same channel twice → one row)", async () => {
    const svc = new ChannelService(
      makeDeps(db, async () => channelRaw([{ id: "v1" }])),
    );
    const a = await svc.add("https://youtube.com/@chan");
    const b = await svc.add("https://youtube.com/channel/UC1");
    expect(b.id).toBe(a.id);
    expect(await svc.list()).toHaveLength(1);
    expect(a.channelId).toBe("UC1");
  });

  it("refresh computes new_count since last_seen and advances it", async () => {
    let entries = [{ id: "v1" }];
    const svc = new ChannelService(
      makeDeps(db, async () => channelRaw(entries)),
    );
    const c = await svc.add("https://youtube.com/@chan"); // last_seen=v1, new=0
    entries = [{ id: "v3" }, { id: "v2" }, { id: "v1" }]; // two new on top
    const refreshed = await svc.refresh(c.id);
    expect(refreshed.newCount).toBe(2);
    const again = await svc.refresh(c.id); // last_seen now v3 → 0 new
    expect(again.newCount).toBe(0);
  });

  it("re-adding an already-tracked channel preserves N-new tracking, refreshes display", async () => {
    let raw: unknown = { ...channelRaw([{ id: "v1" }]), channel: "Old Title" };
    const svc = new ChannelService(makeDeps(db, async () => raw));
    const added = await svc.add("https://youtube.com/@chan"); // last_seen=v1, new=0
    expect(added.title).toBe("Old Title");

    // Accumulate tracking state: refresh sees two new videos on top.
    raw = {
      ...channelRaw([{ id: "v3" }, { id: "v2" }, { id: "v1" }]),
      channel: "Old Title",
    };
    const refreshed = await svc.refresh(added.id);
    expect(refreshed.newCount).toBe(2); // last_seen advanced to v3, new_count=2

    // Re-add (as openForMedia would): fresh newest v4 on top + a new display title.
    raw = {
      ...channelRaw([{ id: "v4" }, { id: "v3" }, { id: "v2" }, { id: "v1" }]),
      channel: "New Title",
    };
    const readded = await svc.add("https://youtube.com/channel/UC1");
    expect(readded.id).toBe(added.id); // same row
    expect(readded.newCount).toBe(2); // NOT reset to 0
    expect(readded.title).toBe("New Title"); // display metadata DID refresh

    // last_seen_video_id preserved at v3 (not advanced to v4): next refresh sees only v4 as new.
    raw = {
      ...channelRaw([{ id: "v4" }, { id: "v3" }, { id: "v2" }, { id: "v1" }]),
      channel: "New Title",
    };
    const after = await svc.refresh(readded.id);
    expect(after.newCount).toBe(1);
  });

  it("listVideos latest requests items 1:count", async () => {
    const flat = vi.fn(async () => channelRaw([{ id: "v2" }, { id: "v1" }]));
    const svc = new ChannelService({ db, runner: { flatPlaylist: flat } });
    const c = await svc.add("https://youtube.com/@chan");
    flat.mockClear();
    const res = await svc.listVideos(c.id, {
      contentType: "videos",
      order: "latest",
      count: 2,
    });
    expect(flat).toHaveBeenCalledWith(
      expect.stringContaining("/videos"),
      { items: "1:2" },
      undefined,
    );
    expect(res.videos.map((v) => v.externalId)).toEqual(["v2", "v1"]);
  });

  it("listVideos live requests items 1:count with /streams tab", async () => {
    const flat = vi.fn(async () => channelRaw([{ id: "v2" }, { id: "v1" }]));
    const svc = new ChannelService({ db, runner: { flatPlaylist: flat } });
    const c = await svc.add("https://youtube.com/@chan");
    flat.mockClear();
    const res = await svc.listVideos(c.id, {
      contentType: "live",
      order: "latest",
      count: 2,
    });
    expect(flat).toHaveBeenCalledWith(
      expect.stringContaining("/streams"),
      { items: "1:2" },
      undefined,
    );
    expect(res.videos.map((v) => v.externalId)).toEqual(["v2", "v1"]);
  });

  it("listVideos oldest requests items -count: and reverses", async () => {
    const flat = vi.fn(async () => channelRaw([{ id: "v9" }, { id: "v8" }])); // yt-dlp tail, newest-first within tail
    const svc = new ChannelService({ db, runner: { flatPlaylist: flat } });
    const c = await svc.add("https://youtube.com/@chan");
    flat.mockClear();
    const res = await svc.listVideos(c.id, {
      contentType: "videos",
      order: "oldest",
      count: 2,
    });
    expect(flat).toHaveBeenCalledWith(
      expect.anything(),
      { items: "-2:" },
      undefined,
    );
    expect(res.videos.map((v) => v.externalId)).toEqual(["v8", "v9"]); // reversed → oldest first
  });

  it("most_viewed sorts by views; falls back to latest with a flag when no views", async () => {
    const withViews = channelRaw([
      { id: "a", view_count: 5 },
      { id: "b", view_count: 99 },
      { id: "c", view_count: 50 },
    ]);
    const svc = new ChannelService({
      db,
      runner: { flatPlaylist: vi.fn(async () => withViews) },
    });
    const c = await svc.add("https://youtube.com/@chan");
    const res = await svc.listVideos(c.id, {
      contentType: "videos",
      order: "most_viewed",
      count: 2,
    });
    expect(res.viewCountsAvailable).toBe(true);
    expect(res.videos.map((v) => v.externalId)).toEqual(["b", "c"]);

    const noViews = channelRaw([{ id: "a" }, { id: "b" }]);
    const svc2 = new ChannelService({
      db,
      runner: { flatPlaylist: vi.fn(async () => noViews) },
    });
    const c2 = await svc2.add("https://youtube.com/@chan");
    const res2 = await svc2.listVideos(c2.id, {
      contentType: "videos",
      order: "most_viewed",
      count: 2,
    });
    expect(res2.viewCountsAvailable).toBe(false);
    expect(res2.order).toBe("latest");
  });

  it("refreshAll: one failing channel does not abort the rest; failures reported", async () => {
    const flat = vi.fn(async (url: string) => {
      if (url.includes("chan2")) throw new Error("boom");
      return channelRaw([{ id: "v1" }]);
    });
    const svc = new ChannelService({ db, runner: { flatPlaylist: flat } });
    const ch1 = await svc.add("https://youtube.com/@chan1");
    // add() itself would hit the same throwing flat() for chan2's own add call, so seed
    // chan2 and chan3 via direct upsertChannel to avoid tripping the failure during setup.
    const ch2 = upsertChannel(db, {
      channel_id: "UCchan2",
      url: "https://www.youtube.com/channel/UCchan2/chan2",
      handle: "@chan2",
      title: "Chan2",
      description: null,
      uploader: null,
      avatar_url: null,
      banner_url: null,
      follower_count: null,
      video_count: null,
      last_seen_video_id: null,
      new_count: 0,
      last_checked: null,
    });
    const ch3 = upsertChannel(db, {
      channel_id: "UCchan3",
      url: "https://www.youtube.com/channel/UCchan3",
      handle: "@chan3",
      title: "Chan3",
      description: null,
      uploader: null,
      avatar_url: null,
      banner_url: null,
      follower_count: null,
      video_count: null,
      last_seen_video_id: null,
      new_count: 0,
      last_checked: null,
    });

    const res = await svc.refreshAll();
    expect(res.refreshed.map((c) => c.channelId).sort()).toEqual(
      [ch1.channelId, ch3.channel_id].sort(),
    );
    expect(res.failures).toHaveLength(1);
    expect(res.failures[0]!.channelId).toBe(ch2.channel_id);
  });

  it("channelUrlForMedia reads channel_url from the media's metadata_json, falls back to uploader_url", async () => {
    const m = insertMedia(db, {
      source_url: "https://youtube.com/watch?v=x",
      platform_id: "youtube",
      external_id: "x",
      title: "T",
      uploader: "U",
      uploader_url: "https://youtube.com/@fallback",
      duration_s: null,
      thumbnail_path: null,
      view_count: null,
      like_count: null,
      published_at: null,
      metadata_json: JSON.stringify({
        channel_url: "https://youtube.com/channel/UCZ",
      }),
      download_status: "none",
    });
    const svc = new ChannelService(
      makeDeps(db, async () => channelRaw([{ id: "v1" }])),
    );
    expect(await svc.channelUrlForMedia(m.id)).toBe(
      "https://youtube.com/channel/UCZ",
    );
    const m2 = insertMedia(db, {
      source_url: "https://youtube.com/watch?v=y",
      platform_id: "youtube",
      external_id: "y",
      title: "T",
      uploader: "U",
      uploader_url: "https://youtube.com/@fallback",
      duration_s: null,
      thumbnail_path: null,
      view_count: null,
      like_count: null,
      published_at: null,
      metadata_json: JSON.stringify({}),
      download_status: "none",
    });
    expect(await svc.channelUrlForMedia(m2.id)).toBe(
      "https://youtube.com/@fallback",
    );
  });
});

describe("subscriptions", () => {
  it("syncs feed/channels, persists, and tags tracked against My channels", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    // A channel already in "My channels" → its sub row must come back tracked:true.
    upsertChannel(db, {
      channel_id: "UCaaa",
      url: "https://www.youtube.com/channel/UCaaa",
      handle: "@a",
      title: "Alpha",
      description: null,
      uploader: null,
      avatar_url: null,
      banner_url: null,
      follower_count: null,
      video_count: null,
      last_seen_video_id: null,
      new_count: 0,
      last_checked: null,
    });
    const runner = {
      flatPlaylist: async (url: string) => {
        expect(url).toBe("https://www.youtube.com/feed/channels");
        return {
          entries: [
            { id: "UCaaa", channel: "Alpha", uploader_id: "a" },
            {
              id: "UCbbb",
              channel: "Bravo",
              uploader_id: "b",
              channel_follower_count: 9,
            },
          ],
        };
      },
    };
    const svc = new ChannelService({ db, runner });
    const out = await svc.syncSubscriptions();
    expect(out.map((s) => s.channelId)).toEqual(["UCaaa", "UCbbb"]); // title-sorted
    expect(out.find((s) => s.channelId === "UCaaa")!.tracked).toBe(true);
    expect(out.find((s) => s.channelId === "UCbbb")!.tracked).toBe(false);
    // Persisted + still tracked-tagged on a plain list()
    const listed = await svc.listSubscriptions();
    expect(listed.map((s) => s.channelId)).toEqual(["UCaaa", "UCbbb"]);
    expect(listed.find((s) => s.channelId === "UCaaa")!.tracked).toBe(true);
  });

  it("an empty feed/channels fetch does not wipe the previously-synced subscription list", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    // Seed a previously-synced subscription directly (as a prior successful sync would have).
    upsertSubscription(db, {
      channel_id: "UCaaa",
      url: "https://www.youtube.com/channel/UCaaa",
      handle: "@a",
      title: "Alpha",
      avatar_url: null,
      follower_count: null,
      synced_at: Date.now(),
    });
    // A signed-out/expired-cookie yt-dlp call can succeed but return zero entries.
    const runner = { flatPlaylist: async () => ({ entries: [] }) };
    const svc = new ChannelService({ db, runner });
    const out = await svc.syncSubscriptions();
    expect(out.map((s) => s.channelId)).toEqual(["UCaaa"]); // preserved, not pruned
    expect(listSubscriptions(db).map((r) => r.channel_id)).toEqual(["UCaaa"]);
  });
});
