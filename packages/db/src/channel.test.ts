import { describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import { runMigrations } from "./migrations";
import {
  deleteChannel,
  getChannelByChannelId,
  getChannelById,
  insertChannel,
  listChannels,
  updateChannelRefresh,
  upsertChannel,
  type NewChannel,
} from "./channel";

const sample = (over: Partial<NewChannel> = {}): NewChannel => ({
  channel_id: "UC_test",
  url: "https://www.youtube.com/channel/UC_test",
  handle: "@test",
  title: "Test Channel",
  description: null,
  uploader: "Test",
  avatar_url: null,
  banner_url: null,
  follower_count: 1000,
  video_count: 42,
  last_seen_video_id: "vid1",
  new_count: 0,
  last_checked: null,
  ...over,
});

describe("channel CRUD", () => {
  it("inserts, gets by id and channel_id, lists newest-first", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const a = insertChannel(db, sample({ channel_id: "UC_a", title: "A" }));
    insertChannel(db, sample({ channel_id: "UC_b", title: "B" }));
    expect(getChannelById(db, a.id)!.channel_id).toBe("UC_a");
    expect(getChannelByChannelId(db, "UC_b")!.title).toBe("B");
    expect(listChannels(db).map((c) => c.channel_id)).toEqual(["UC_b", "UC_a"]);
  });

  it("upsert is keyed by channel_id — same id twice → one row, metadata refreshed", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const first = upsertChannel(
      db,
      sample({ title: "Old", follower_count: 1 }),
    );
    const second = upsertChannel(
      db,
      sample({ title: "New", follower_count: 2 }),
    );
    expect(second.id).toBe(first.id);
    expect(listChannels(db)).toHaveLength(1);
    expect(getChannelById(db, first.id)!.title).toBe("New");
    expect(getChannelById(db, first.id)!.follower_count).toBe(2);
    expect(getChannelById(db, first.id)!.created_at).toBe(first.created_at); // preserved
  });

  it("updateChannelRefresh + delete", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const c = insertChannel(db, sample());
    updateChannelRefresh(db, c.id, {
      last_seen_video_id: "vidX",
      new_count: 3,
      video_count: 42,
      last_checked: 123,
    });
    const after = getChannelById(db, c.id)!;
    expect(after.new_count).toBe(3);
    expect(after.video_count).toBe(42);
    expect(after.last_seen_video_id).toBe("vidX");
    expect(after.last_checked).toBe(123);
    deleteChannel(db, c.id);
    expect(getChannelById(db, c.id)).toBeUndefined();
  });
});
