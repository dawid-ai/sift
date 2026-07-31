import { describe, it, expect, beforeEach } from "vitest";
import { openTestDatabase } from "./testing";
import type { SiftDatabase } from "./database";
import { runMigrations } from "./migrations";
import { insertMedia } from "./media";
import { addTag, removeTag, tagsForMedia, tagsForMediaIds, listAllTags } from "./tag";

// NewMedia literal copied from media.test.ts's sample() helper, with source_url
// swapped for the passed url.
function newMedia(db: SiftDatabase, url: string): number {
  return insertMedia(db, {
    source_url: url, platform_id: "youtube", external_id: "abc",
    title: "Vid", uploader: "Chan", uploader_url: null, duration_s: 100,
    thumbnail_path: "https://y/thumb.jpg", view_count: 5, like_count: 1,
    published_at: null, metadata_json: "{}", download_status: "downloading",
  }).id;
}

describe("media_tag CRUD", () => {
  let db: SiftDatabase;
  beforeEach(async () => {
    db = await openTestDatabase();
    runMigrations(db);
  });

  it("adds, lists, and is idempotent", () => {
    const m = newMedia(db, "a");
    addTag(db, m, "Music");
    addTag(db, m, "Music"); // idempotent
    addTag(db, m, "  News  "); // trims
    expect(tagsForMedia(db, m)).toEqual(["Music", "News"]);
  });

  it("ignores empty/whitespace names", () => {
    const m = newMedia(db, "a");
    addTag(db, m, "   ");
    addTag(db, m, "");
    expect(tagsForMedia(db, m)).toEqual([]);
  });

  it("collapses case-insensitive duplicates on one media", () => {
    const m = newMedia(db, "a");
    addTag(db, m, "Music");
    addTag(db, m, "music");
    expect(tagsForMedia(db, m)).toEqual(["Music"]);
  });

  it("removes a tag", () => {
    const m = newMedia(db, "a");
    addTag(db, m, "Music");
    removeTag(db, m, "music"); // case-insensitive
    expect(tagsForMedia(db, m)).toEqual([]);
  });

  it("cascades on media delete", () => {
    const m = newMedia(db, "a");
    addTag(db, m, "Music");
    db.prepare("DELETE FROM media WHERE id = ?").run(m);
    expect(listAllTags(db)).toEqual([]);
  });

  it("batches tagsForMediaIds", () => {
    const a = newMedia(db, "a");
    const b = newMedia(db, "b");
    addTag(db, a, "Music");
    addTag(db, a, "Live");
    addTag(db, b, "Music");
    const map = tagsForMediaIds(db, [a, b]);
    expect(map.get(a)).toEqual(["Live", "Music"]);
    expect(map.get(b)).toEqual(["Music"]);
  });

  it("listAllTags counts case-insensitively", () => {
    const a = newMedia(db, "a");
    const b = newMedia(db, "b");
    addTag(db, a, "Music");
    addTag(db, b, "music");
    expect(listAllTags(db)).toEqual([{ name: "Music", count: 2 }]);
  });
});
