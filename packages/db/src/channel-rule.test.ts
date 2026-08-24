import { beforeEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import type { SiftDatabase } from "./database";
import { runMigrations } from "./migrations";
import { upsertChannel } from "./channel";
import {
  deleteChannelRule,
  getChannelRule,
  listChannelRules,
  listEnabledChannelRules,
  setChannelRuleWatermark,
  upsertChannelRule,
} from "./channel-rule";

let db: SiftDatabase;

function channel(channelId: string) {
  return upsertChannel(db, {
    channel_id: channelId,
    url: `https://youtube.com/${channelId}`,
    handle: null,
    title: channelId,
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
}

const input = (channelId: string, over = {}) => ({
  channel_id: channelId,
  enabled: true,
  min_duration_s: 600,
  max_duration_s: null,
  keywords: ["rust", "go"],
  min_views: 1000,
  exclude_shorts: true,
  ...over,
});

beforeEach(async () => {
  db = await openTestDatabase();
  runMigrations(db);
});

describe("upsertChannelRule", () => {
  it("round-trips every field", () => {
    channel("UC1");
    const saved = upsertChannelRule(db, input("UC1"));
    expect(saved.enabled).toBe(true);
    expect(saved.keywords).toEqual(["rust", "go"]);
    expect(saved.min_duration_s).toBe(600);
    expect(saved.max_duration_s).toBeNull();
    expect(saved.exclude_shorts).toBe(true);
  });

  it("replaces on a second save rather than erroring", () => {
    channel("UC1");
    upsertChannelRule(db, input("UC1"));
    const updated = upsertChannelRule(
      db,
      input("UC1", { keywords: ["zig"], enabled: false }),
    );
    expect(updated.keywords).toEqual(["zig"]);
    expect(updated.enabled).toBe(false);
    expect(listChannelRules(db)).toHaveLength(1);
  });

  it("keeps the watermark across an edit, so editing a rule cannot re-queue old uploads", () => {
    channel("UC1");
    upsertChannelRule(db, input("UC1"));
    setChannelRuleWatermark(db, "UC1", "vid-9");
    upsertChannelRule(db, input("UC1", { min_views: 5 }));
    expect(getChannelRule(db, "UC1")?.last_queued_id).toBe("vid-9");
  });
});

describe("listEnabledChannelRules", () => {
  it("returns only the switched-on rules", () => {
    channel("UC1");
    channel("UC2");
    upsertChannelRule(db, input("UC1", { enabled: true }));
    upsertChannelRule(db, input("UC2", { enabled: false }));
    expect(listEnabledChannelRules(db).map((r) => r.channel_id)).toEqual([
      "UC1",
    ]);
  });
});

describe("robustness", () => {
  it("reads a malformed keywords blob as no keywords", () => {
    channel("UC1");
    upsertChannelRule(db, input("UC1"));
    db.prepare(
      "UPDATE channel_rule SET keywords_json = '{not json' WHERE channel_id = 'UC1'",
    ).run();
    const rule = getChannelRule(db, "UC1");
    expect(rule?.keywords).toEqual([]);
    // The rest of the rule survives.
    expect(rule?.min_duration_s).toBe(600);
  });

  it("drops non-string entries from the keywords array", () => {
    channel("UC1");
    upsertChannelRule(db, input("UC1"));
    db.prepare(
      `UPDATE channel_rule SET keywords_json = '["ok", 5, null]' WHERE channel_id = 'UC1'`,
    ).run();
    expect(getChannelRule(db, "UC1")?.keywords).toEqual(["ok"]);
  });

  it("cascades when the channel goes", () => {
    const row = channel("UC1");
    upsertChannelRule(db, input("UC1"));
    db.prepare("DELETE FROM channel WHERE id = ?").run(row.id);
    expect(getChannelRule(db, "UC1")).toBeUndefined();
  });

  it("deletes by channel id", () => {
    channel("UC1");
    upsertChannelRule(db, input("UC1"));
    deleteChannelRule(db, "UC1");
    expect(listChannelRules(db)).toEqual([]);
  });
});
