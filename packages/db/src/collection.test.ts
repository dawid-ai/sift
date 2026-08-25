import { describe, it, expect, beforeEach } from "vitest";
import { openTestDatabase } from "./testing";
import type { SiftDatabase } from "./database";
import { runMigrations } from "./migrations";
import { insertMedia, listMediaIds, listMediaPage } from "./media";
import {
  addToCollection,
  collectionsForMedia,
  createCollection,
  deleteCollection,
  listCollections,
  removeFromCollection,
  renameCollection,
  setFavourite,
  setPinned,
} from "./collection";

function media(db: SiftDatabase, title: string): number {
  return insertMedia(db, {
    source_url: `https://y/${title}`,
    platform_id: "youtube",
    external_id: title,
    title,
    uploader: "Chan",
    uploader_url: null,
    duration_s: 100,
    thumbnail_path: null,
    view_count: null,
    like_count: null,
    published_at: null,
    metadata_json: "{}",
    download_status: "none",
  }).id;
}

let db: SiftDatabase;
beforeEach(async () => {
  db = await openTestDatabase();
  runMigrations(db);
});

describe("collections", () => {
  it("creates, is idempotent by name, renames, and counts members", () => {
    const a = createCollection(db, " Watch later ");
    expect(a.name).toBe("Watch later");
    // Same name, different case — one collection, not two.
    expect(createCollection(db, "watch later").id).toBe(a.id);

    addToCollection(db, a.id, [media(db, "one"), media(db, "two")]);
    expect(listCollections(db)).toEqual([
      expect.objectContaining({ name: "Watch later", count: 2 }),
    ]);

    renameCollection(db, a.id, "Queue");
    expect(listCollections(db)[0]?.name).toBe("Queue");
  });

  it("rejects a blank name", () => {
    expect(() => createCollection(db, "   ")).toThrow(/needs a name/);
  });

  it("reports how many were actually added, ignoring ones already in", () => {
    const c = createCollection(db, "c");
    const one = media(db, "one");
    const two = media(db, "two");
    expect(addToCollection(db, c.id, [one, two])).toBe(2);
    expect(addToCollection(db, c.id, [two, media(db, "three")])).toBe(1);
    expect(listCollections(db)[0]?.count).toBe(3);
  });

  it("removes members without touching the media rows", () => {
    const c = createCollection(db, "c");
    const one = media(db, "one");
    addToCollection(db, c.id, [one]);
    removeFromCollection(db, c.id, [one]);
    expect(listCollections(db)[0]?.count).toBe(0);
    expect(listMediaIds(db, {})).toContain(one);
  });

  it("deleting a collection leaves the videos alone", () => {
    const c = createCollection(db, "c");
    const one = media(db, "one");
    addToCollection(db, c.id, [one]);
    deleteCollection(db, c.id);
    expect(listCollections(db)).toEqual([]);
    expect(listMediaIds(db, {})).toContain(one);
  });

  it("deleting a media removes it from its collections", () => {
    const c = createCollection(db, "c");
    const one = media(db, "one");
    addToCollection(db, c.id, [one]);
    db.prepare("DELETE FROM media WHERE id = ?").run(one);
    expect(listCollections(db)[0]?.count).toBe(0);
  });

  it("reports which collections a media belongs to", () => {
    const a = createCollection(db, "a");
    const b = createCollection(db, "b");
    const one = media(db, "one");
    addToCollection(db, a.id, [one]);
    addToCollection(db, b.id, [one]);
    expect(collectionsForMedia(db, one)).toEqual([a.id, b.id]);
  });

  it("filters the library by collection", () => {
    const c = createCollection(db, "c");
    const inside = media(db, "inside");
    media(db, "outside");
    addToCollection(db, c.id, [inside]);
    expect(listMediaIds(db, { collectionId: c.id })).toEqual([inside]);
  });
});

describe("favourites and pinning", () => {
  it("filters to favourites only", () => {
    const fav = media(db, "fav");
    media(db, "plain");
    setFavourite(db, fav, true);
    expect(listMediaIds(db, { favourite: true })).toEqual([fav]);
    setFavourite(db, fav, false);
    expect(listMediaIds(db, { favourite: true })).toEqual([]);
  });

  it("sorts pinned rows first, in the order they were pinned", () => {
    const first = media(db, "first");
    const second = media(db, "second");
    const third = media(db, "third");
    // Newest first by default, so the natural order is third, second, first.
    expect(listMediaIds(db, {})).toEqual([third, second, first]);

    setPinned(db, first, true);
    expect(listMediaIds(db, {})[0]).toBe(first);

    setPinned(db, third, true);
    // first was pinned earlier, so it stays ahead of third.
    expect(listMediaIds(db, {}).slice(0, 2)).toEqual([first, third]);

    setPinned(db, first, false);
    expect(listMediaIds(db, {})[0]).toBe(third);
  });

  it("keeps the page query and the id query in the same order", () => {
    const a = media(db, "a");
    media(db, "b");
    setPinned(db, a, true);
    const page = listMediaPage(db, {}, 10, 0);
    expect(page.rows.map((r) => r.id)).toEqual(listMediaIds(db, {}));
  });
});
