import { beforeEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import {
  runMigrations,
  insertMedia,
  setMediaDownload,
  getMediaById,
  listMedia,
  deleteMedia,
  getMediaBySourceUrl,
  backfillMediaChannelIds,
  listMediaByChannelId,
} from "./index";
import type { SiftDatabase, NewMedia } from "./index";

function sample(overrides: Partial<NewMedia> = {}): NewMedia {
  return {
    source_url: "https://y/1", platform_id: "youtube", external_id: "abc",
    title: "Vid", uploader: "Chan", uploader_url: null, duration_s: 100,
    thumbnail_path: "https://y/thumb.jpg", view_count: 5, like_count: 1,
    published_at: null, metadata_json: "{}", download_status: "downloading",
    ...overrides,
  };
}

describe("media queries", () => {
  let db: SiftDatabase;
  beforeEach(async () => { db = await openTestDatabase(); runMigrations(db); });

  it("stores channel_id on insert and lists media by channel newest-first", () => {
    insertMedia(db, sample({ source_url: "https://y/a", channel_id: "UC1" }));
    insertMedia(db, sample({ source_url: "https://y/b", channel_id: "UC2" }));
    const b2 = insertMedia(db, sample({ source_url: "https://y/c", channel_id: "UC1" }));
    const uc1 = listMediaByChannelId(db, "UC1");
    expect(uc1.map((m) => m.source_url)).toEqual(["https://y/c", "https://y/a"]);
    expect(uc1[0]!.id).toBe(b2.id);
    expect(listMediaByChannelId(db, "UCnope")).toHaveLength(0);
  });

  it("backfillMediaChannelIds fills channel_id from metadata_json, skips rows without it, idempotently", () => {
    const withId = insertMedia(db, sample({ source_url: "https://y/a", metadata_json: JSON.stringify({ channel_id: "UCabc" }) }));
    const withoutId = insertMedia(db, sample({ source_url: "https://y/b", metadata_json: JSON.stringify({ title: "x" }) }));
    expect(getMediaById(db, withId.id)!.channel_id).toBeNull();

    backfillMediaChannelIds(db);
    expect(getMediaById(db, withId.id)!.channel_id).toBe("UCabc");
    expect(getMediaById(db, withoutId.id)!.channel_id).toBeNull();

    // Idempotent + doesn't clobber an already-set value.
    backfillMediaChannelIds(db);
    expect(getMediaById(db, withId.id)!.channel_id).toBe("UCabc");
  });

  it("inserts and reads back a media row with generated id and timestamps", () => {
    const row = insertMedia(db, sample());
    expect(row.id).toBeGreaterThan(0);
    expect(row.download_path).toBeNull();
    expect(row.download_status).toBe("downloading");
    expect(row.created_at).toBeGreaterThan(0);
    expect(getMediaById(db, row.id)?.title).toBe("Vid");
  });

  it("updates download status + path via setMediaDownload", () => {
    const row = insertMedia(db, sample());
    setMediaDownload(db, row.id, "done", "/dir/Vid.mp4");
    const after = getMediaById(db, row.id)!;
    expect(after.download_status).toBe("done");
    expect(after.download_path).toBe("/dir/Vid.mp4");
    expect(after.updated_at).toBeGreaterThanOrEqual(row.updated_at);
  });

  it("listMedia returns newest first", () => {
    const a = insertMedia(db, sample({ title: "A" }));
    const b = insertMedia(db, sample({ title: "B" }));
    const titles = listMedia(db).map((r) => r.title);
    expect(titles).toEqual(["B", "A"]);
    expect(a.id).toBeLessThan(b.id);
  });

  it("deleteMedia removes a row by id", () => {
    const a = insertMedia(db, sample({ title: "A" }));
    const b = insertMedia(db, sample({ title: "B" }));
    deleteMedia(db, a.id);
    expect(getMediaById(db, a.id)).toBeUndefined();
    expect(listMedia(db).map((r) => r.id)).toEqual([b.id]);
  });

  it("getMediaBySourceUrl returns the most-recent row for a url, or undefined", () => {
    expect(getMediaBySourceUrl(db, "https://y/none")).toBeUndefined();
    const first = insertMedia(db, sample({ source_url: "https://y/dup", title: "First" }));
    const second = insertMedia(db, sample({ source_url: "https://y/dup", title: "Second" }));
    const got = getMediaBySourceUrl(db, "https://y/dup");
    expect(got?.id).toBe(second.id);
    expect(got?.title).toBe("Second");
    expect(first.id).toBeLessThan(second.id);
  });
});
