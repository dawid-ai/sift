import { beforeEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import {
  runMigrations,
  insertMedia,
  insertFrame,
  getFramesByMediaId,
  deleteFramesByMediaId,
  deleteAutoFramesByMediaId,
  setFrameIncluded,
} from "./index";
import type { SiftDatabase, NewMedia, NewFrame } from "./index";

function media(db: SiftDatabase, url = "https://y/1"): number {
  const m: NewMedia = {
    source_url: url,
    platform_id: "youtube",
    external_id: "abc",
    title: "Vid",
    uploader: "Chan",
    uploader_url: null,
    duration_s: 100,
    thumbnail_path: null,
    view_count: null,
    like_count: null,
    published_at: null,
    metadata_json: null,
    download_status: "none",
  };
  return insertMedia(db, m).id;
}
function frame(mediaId: number, overrides: Partial<NewFrame> = {}): NewFrame {
  return {
    media_id: mediaId,
    ts_ms: 4167,
    image_path: "/f/frame-0001.jpg",
    ocr_text: "Q3 Revenue",
    ocr_confidence: 88.5,
    phash: null,
    kind: "slide",
    ...overrides,
  };
}

describe("frame queries", () => {
  let db: SiftDatabase;
  beforeEach(async () => {
    db = await openTestDatabase();
    runMigrations(db);
  });

  it("inserts and reads back a frame with generated id and timestamp", () => {
    const mid = media(db);
    const row = insertFrame(db, frame(mid));
    expect(row.id).toBeGreaterThan(0);
    expect(row.created_at).toBeGreaterThan(0);
    expect(row.ocr_confidence).toBe(88.5);
    const got = getFramesByMediaId(db, mid);
    expect(got).toHaveLength(1);
    expect(got[0]!.ocr_text).toBe("Q3 Revenue");
  });

  it("orders by timestamp ascending, scoped to the media id", () => {
    const a = media(db, "https://y/a");
    const b = media(db, "https://y/b");
    insertFrame(db, frame(a, { ts_ms: 20000, ocr_text: "A2" }));
    insertFrame(db, frame(a, { ts_ms: 4000, ocr_text: "A1" }));
    insertFrame(db, frame(b, { ts_ms: 1000, ocr_text: "B1" }));
    expect(getFramesByMediaId(db, a).map((r) => r.ocr_text)).toEqual([
      "A1",
      "A2",
    ]);
    expect(getFramesByMediaId(db, b).map((r) => r.ocr_text)).toEqual(["B1"]);
  });

  it("cascades on media delete via deleteFramesByMediaId", () => {
    const mid = media(db);
    insertFrame(db, frame(mid));
    deleteFramesByMediaId(db, mid);
    expect(getFramesByMediaId(db, mid)).toHaveLength(0);
  });

  it("defaults included to 1 and toggles it", () => {
    const mid = media(db);
    const row = insertFrame(db, frame(mid));
    expect(row.included).toBe(1);
    setFrameIncluded(db, row.id, false);
    expect(getFramesByMediaId(db, mid)[0]!.included).toBe(0);
    setFrameIncluded(db, row.id, true);
    expect(getFramesByMediaId(db, mid)[0]!.included).toBe(1);
  });

  it("deleteAutoFramesByMediaId removes auto frames but keeps manual captures", () => {
    const mid = media(db);
    insertFrame(db, frame(mid, { kind: "slide", ts_ms: 1000 }));
    insertFrame(db, frame(mid, { kind: "manual", ts_ms: 2000 }));
    deleteAutoFramesByMediaId(db, mid);
    const rows = getFramesByMediaId(db, mid);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("manual");
  });
});
