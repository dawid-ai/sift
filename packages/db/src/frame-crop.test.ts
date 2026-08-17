import { beforeEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import {
  runMigrations,
  insertMedia,
  getFrameCrop,
  setFrameCrop,
  clearFrameCrop,
} from "./index";
import type { SiftDatabase, NewMedia } from "./index";

function media(db: SiftDatabase): number {
  const m: NewMedia = {
    source_url: "https://y/1",
    platform_id: "youtube",
    external_id: "abc",
    title: "V",
    uploader: "C",
    uploader_url: null,
    duration_s: 100,
    thumbnail_path: null,
    view_count: null,
    like_count: null,
    published_at: null,
    metadata_json: null,
    download_status: "downloaded",
  };
  return insertMedia(db, m).id;
}

describe("frame crop", () => {
  let db: SiftDatabase;
  beforeEach(async () => {
    db = await openTestDatabase();
    runMigrations(db);
  });

  it("is absent by default, then round-trips and clears", () => {
    const mid = media(db);
    expect(getFrameCrop(db, mid)).toBeUndefined();
    setFrameCrop(db, mid, { x: 0.1, y: 0.2, w: 0.5, h: 0.6 });
    expect(getFrameCrop(db, mid)).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 });
    clearFrameCrop(db, mid);
    expect(getFrameCrop(db, mid)).toBeUndefined();
  });

  it("upserts (one row per media)", () => {
    const mid = media(db);
    setFrameCrop(db, mid, { x: 0, y: 0, w: 1, h: 1 });
    setFrameCrop(db, mid, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(getFrameCrop(db, mid)).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  });
});
