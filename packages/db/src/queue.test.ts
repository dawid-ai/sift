import { describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import { runMigrations } from "./migrations";
import { insertMedia, type NewMedia } from "./media";
import {
  deleteQueueItem,
  getQueueItem,
  insertQueueItem,
  listQueueItems,
  maxQueueOrder,
  resetRunningToQueued,
  setQueueOrder,
  updateQueueItem,
  type NewQueueItem,
} from "./queue";

function sampleMedia(overrides: Partial<NewMedia> = {}): NewMedia {
  return {
    source_url: "https://y/1",
    platform_id: "youtube",
    external_id: "abc",
    title: "Vid",
    uploader: "Chan",
    uploader_url: null,
    duration_s: 100,
    thumbnail_path: "https://y/thumb.jpg",
    view_count: 5,
    like_count: 1,
    published_at: null,
    metadata_json: "{}",
    download_status: "none",
    ...overrides,
  };
}

const sample = (over: Partial<NewQueueItem> = {}): NewQueueItem => ({
  source_url: "https://x/1",
  spec_json: JSON.stringify({
    format: { kind: "video", maxHeight: null, mp4: true },
    download: true,
    transcript: false,
    summarize: null,
  }),
  status: "queued",
  ops_json: JSON.stringify({
    download: "pending",
    transcript: "skipped",
    summarize: "skipped",
  }),
  media_id: null,
  queue_order: 1,
  error: null,
  ...over,
});

describe("queue CRUD", () => {
  it("inserts, lists in queue_order, and gets", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    insertQueueItem(db, sample({ source_url: "https://x/b", queue_order: 2 }));
    insertQueueItem(db, sample({ source_url: "https://x/a", queue_order: 1 }));
    const items = listQueueItems(db);
    expect(items.map((i) => i.source_url)).toEqual([
      "https://x/a",
      "https://x/b",
    ]);
    expect(getQueueItem(db, items[0]!.id)!.source_url).toBe("https://x/a");
  });

  it("updateQueueItem patches only provided fields (can clear error to null)", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const row = insertQueueItem(db, sample({ error: "boom" }));
    updateQueueItem(db, row.id, { status: "running" });
    expect(getQueueItem(db, row.id)!.error).toBe("boom"); // untouched
    const media = insertMedia(db, sampleMedia());
    updateQueueItem(db, row.id, { error: null, media_id: media.id });
    const after = getQueueItem(db, row.id)!;
    expect(after.error).toBeNull();
    expect(after.media_id).toBe(media.id);
    expect(after.status).toBe("running");
  });

  it("maxQueueOrder is 0 when empty, else the highest order", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    expect(maxQueueOrder(db)).toBe(0);
    insertQueueItem(db, sample({ queue_order: 7 }));
    expect(maxQueueOrder(db)).toBe(7);
  });

  it("setQueueOrder + delete", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const a = insertQueueItem(db, sample({ queue_order: 1 }));
    setQueueOrder(db, a.id, 9);
    expect(getQueueItem(db, a.id)!.queue_order).toBe(9);
    deleteQueueItem(db, a.id);
    expect(getQueueItem(db, a.id)).toBeUndefined();
  });

  it("resetRunningToQueued only touches running rows and returns the count", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    insertQueueItem(db, sample({ status: "running" }));
    insertQueueItem(db, sample({ status: "running" }));
    insertQueueItem(db, sample({ status: "done" }));
    expect(resetRunningToQueued(db)).toBe(2);
    expect(
      listQueueItems(db).filter((i) => i.status === "running"),
    ).toHaveLength(0);
    expect(listQueueItems(db).filter((i) => i.status === "done")).toHaveLength(
      1,
    );
  });
});
