import { describe, it, expect, beforeEach } from "vitest";
import { openTestDatabase } from "./testing";
import { runMigrations } from "./migrations";
import {
  upsertSubscription, listSubscriptions, replaceSubscriptions, clearSubscriptions,
  type NewSubscription, type SiftDatabase,
} from "./index";

function sub(over: Partial<NewSubscription> = {}): NewSubscription {
  return {
    channel_id: "UC1", url: "https://www.youtube.com/channel/UC1", handle: "@one",
    title: "One", avatar_url: null, follower_count: 100, synced_at: 1, ...over,
  };
}

describe("subscription CRUD", () => {
  let db: SiftDatabase;
  beforeEach(async () => { db = await openTestDatabase(); runMigrations(db); });

  it("upserts by channel_id and lists title-sorted", () => {
    upsertSubscription(db, sub({ channel_id: "UC2", title: "Bravo" }));
    upsertSubscription(db, sub({ channel_id: "UC1", title: "alpha" }));
    upsertSubscription(db, sub({ channel_id: "UC1", title: "Alpha", follower_count: 5 })); // update, not insert
    const rows = listSubscriptions(db);
    expect(rows.map((r) => r.channel_id)).toEqual(["UC1", "UC2"]); // Alpha < Bravo, NOCASE
    expect(rows[0]!.follower_count).toBe(5);
    expect(rows[0]!.title).toBe("Alpha");
  });

  it("replaceSubscriptions upserts present and prunes absent", () => {
    replaceSubscriptions(db, [sub({ channel_id: "UC1" }), sub({ channel_id: "UC2", title: "Two" })]);
    replaceSubscriptions(db, [sub({ channel_id: "UC2", title: "Two v2" })]); // UC1 absent → pruned
    const rows = listSubscriptions(db);
    expect(rows.map((r) => r.channel_id)).toEqual(["UC2"]);
    expect(rows[0]!.title).toBe("Two v2");
  });

  it("replaceSubscriptions with empty array clears the table", () => {
    replaceSubscriptions(db, [sub()]);
    replaceSubscriptions(db, []);
    expect(listSubscriptions(db)).toEqual([]);
  });

  it("clearSubscriptions empties the table", () => {
    upsertSubscription(db, sub());
    clearSubscriptions(db);
    expect(listSubscriptions(db)).toEqual([]);
  });
});
