import { describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import { runMigrations } from "./migrations";
import { insertChannel, deleteChannel, type NewChannel } from "./channel";
import {
  countChannelVideos,
  listChannelVideos,
  listChannelViewCounts,
  upsertChannelVideos,
  type NewChannelVideo,
} from "./channel-video";

const channel = (): NewChannel => ({
  channel_id: "UC_test",
  url: "https://www.youtube.com/channel/UC_test",
  handle: "@test",
  title: "Test Channel",
  description: null,
  uploader: "Test",
  avatar_url: null,
  banner_url: null,
  follower_count: 1000,
  video_count: 3,
  last_seen_video_id: null,
  new_count: 0,
  last_checked: null,
});

const video = (id: string, views: number | null): NewChannelVideo => ({
  external_id: id,
  url: `https://www.youtube.com/watch?v=${id}`,
  title: `Video ${id}`,
  duration_s: 600,
  view_count: views,
  is_short: 0,
});

describe("channel_video", () => {
  it("stores a listing newest-first and reads its view counts back", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    upsertChannelVideos(db, "UC_test", "videos", [
      video("a", 100),
      video("b", 50),
      video("c", null),
    ]);

    const rows = listChannelVideos(db, "UC_test", "videos");
    expect(rows.map((r) => r.external_id)).toEqual(["a", "b", "c"]);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    // A null view count is stored but never reaches the median baseline.
    expect(listChannelViewCounts(db, "UC_test", "videos").sort()).toEqual([
      100, 50,
    ]);
    expect(countChannelVideos(db, "UC_test", "videos")).toBe(3);
    expect(countChannelVideos(db, "UC_test", "shorts")).toBe(0);
  });

  it("updates stats in place and keeps a video that dropped out of the listing", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    upsertChannelVideos(
      db,
      "UC_test",
      "videos",
      [video("a", 100), video("b", 50)],
      1000,
    );
    // A second sync where "a" gained views and "b" is gone (private/deleted).
    upsertChannelVideos(db, "UC_test", "videos", [video("a", 175)], 2000);

    const rows = listChannelVideos(db, "UC_test", "videos");
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.external_id === "a")!;
    expect(a.view_count).toBe(175);
    expect(a.first_seen).toBe(1000);
    expect(a.last_seen).toBe(2000);
    // "b" keeps its last known stats rather than vanishing.
    expect(rows.find((r) => r.external_id === "b")!.view_count).toBe(50);
  });

  it("keeps content types apart", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    upsertChannelVideos(db, "UC_test", "videos", [video("a", 100)]);
    upsertChannelVideos(db, "UC_test", "shorts", [video("s", 9000)]);
    expect(listChannelViewCounts(db, "UC_test", "videos")).toEqual([100]);
    expect(listChannelViewCounts(db, "UC_test", "shorts")).toEqual([9000]);
  });

  it("drops the catalogue when the channel is removed", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const c = insertChannel(db, channel());
    upsertChannelVideos(db, "UC_test", "videos", [video("a", 100)]);
    deleteChannel(db, c.id);
    expect(countChannelVideos(db, "UC_test", "videos")).toBe(0);
  });
});
