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
  listMediaPage,
  listMediaIds,
  listMediaChannels,
  listMediaPlatforms,
  addTag,
} from "./index";
import type { SiftDatabase, NewMedia } from "./index";

function sample(overrides: Partial<NewMedia> = {}): NewMedia {
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
    download_status: "downloading",
    ...overrides,
  };
}

describe("media queries", () => {
  let db: SiftDatabase;
  beforeEach(async () => {
    db = await openTestDatabase();
    runMigrations(db);
  });

  it("stores channel_id on insert and lists media by channel newest-first", () => {
    insertMedia(db, sample({ source_url: "https://y/a", channel_id: "UC1" }));
    insertMedia(db, sample({ source_url: "https://y/b", channel_id: "UC2" }));
    const b2 = insertMedia(
      db,
      sample({ source_url: "https://y/c", channel_id: "UC1" }),
    );
    const uc1 = listMediaByChannelId(db, "UC1");
    expect(uc1.map((m) => m.source_url)).toEqual([
      "https://y/c",
      "https://y/a",
    ]);
    expect(uc1[0]!.id).toBe(b2.id);
    expect(listMediaByChannelId(db, "UCnope")).toHaveLength(0);
  });

  it("backfillMediaChannelIds fills channel_id from metadata_json, skips rows without it, idempotently", () => {
    const withId = insertMedia(
      db,
      sample({
        source_url: "https://y/a",
        metadata_json: JSON.stringify({ channel_id: "UCabc" }),
      }),
    );
    const withoutId = insertMedia(
      db,
      sample({
        source_url: "https://y/b",
        metadata_json: JSON.stringify({ title: "x" }),
      }),
    );
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

  it("listMediaPage paginates newest-first with a total, and filters by channel/platform/tag/ids", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      insertMedia(
        db,
        sample({
          source_url: `https://y/${i}`,
          title: `V${i}`,
          uploader: i % 2 === 0 ? "Alice" : "Bob",
          platform_id: i < 3 ? "youtube" : "twitter",
        }),
      ),
    );
    addTag(db, rows[0]!.id, "music");
    addTag(db, rows[4]!.id, "MUSIC"); // case-insensitive match

    // Page 1 of 2 (size 3), newest first, total counts the whole set.
    const p0 = listMediaPage(db, {}, 3, 0);
    expect(p0.total).toBe(5);
    expect(p0.rows.map((r) => r.title)).toEqual(["V4", "V3", "V2"]);
    const p1 = listMediaPage(db, {}, 3, 3);
    expect(p1.rows.map((r) => r.title)).toEqual(["V1", "V0"]);

    // Filters constrain both rows and total.
    expect(listMediaPage(db, { channel: "Alice" }, 10, 0).total).toBe(3); // V0,V2,V4
    expect(listMediaPage(db, { platform: "twitter" }, 10, 0).total).toBe(2); // V3,V4
    expect(
      listMediaPage(db, { tags: ["music"] }, 10, 0).rows.map((r) => r.title),
    ).toEqual(["V4", "V0"]);

    // Multiple tags AND together: V0 has both, V4 only "MUSIC".
    addTag(db, rows[0]!.id, "live");
    expect(
      listMediaPage(db, { tags: ["music", "Live"] }, 10, 0).rows.map(
        (r) => r.title,
      ),
    ).toEqual(["V0"]);
    expect(listMediaPage(db, { tags: [] }, 10, 0).total).toBe(5); // empty list constrains nothing

    // excludeTags is the negative filter: everything EXCEPT rows carrying the tag,
    // case-insensitive, and it stacks with a positive filter.
    expect(
      listMediaPage(db, { excludeTags: ["Music"] }, 10, 0).rows.map(
        (r) => r.title,
      ),
    ).toEqual(["V3", "V2", "V1"]);
    expect(listMediaPage(db, { excludeTags: [] }, 10, 0).total).toBe(5); // empty list constrains nothing
    expect(
      listMediaPage(
        db,
        { channel: "Alice", excludeTags: ["music"] },
        10,
        0,
      ).rows.map((r) => r.title),
    ).toEqual(["V2"]);

    // ids allowlist; empty allowlist matches nothing (empty search result).
    expect(
      listMediaPage(db, { ids: [rows[1]!.id, rows[3]!.id] }, 10, 0).rows.map(
        (r) => r.title,
      ),
    ).toEqual(["V3", "V1"]);
    expect(listMediaPage(db, { ids: [] }, 10, 0).total).toBe(0);

    // listIds returns all matching ids (newest first) across pages.
    expect(listMediaIds(db, { channel: "Bob" })).toEqual([
      rows[3]!.id,
      rows[1]!.id,
    ]);

    // Facets span the whole library.
    expect(listMediaChannels(db)).toEqual(["Alice", "Bob"]);
    expect(listMediaPlatforms(db)).toEqual(["twitter", "youtube"]);
  });

  it("getMediaBySourceUrl returns the most-recent row for a url, or undefined", () => {
    expect(getMediaBySourceUrl(db, "https://y/none")).toBeUndefined();
    const first = insertMedia(
      db,
      sample({ source_url: "https://y/dup", title: "First" }),
    );
    const second = insertMedia(
      db,
      sample({ source_url: "https://y/dup", title: "Second" }),
    );
    const got = getMediaBySourceUrl(db, "https://y/dup");
    expect(got?.id).toBe(second.id);
    expect(got?.title).toBe("Second");
    expect(first.id).toBeLessThan(second.id);
  });
});
