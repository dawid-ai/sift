import { beforeEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import {
  runMigrations, insertMedia, insertTranscript, getTranscriptsByMediaId,
} from "./index";
import type { SiftDatabase, NewMedia, NewTranscript } from "./index";

function media(db: SiftDatabase, url = "https://y/1"): number {
  const m: NewMedia = {
    source_url: url, platform_id: "youtube", external_id: "abc", title: "Vid",
    uploader: "Chan", uploader_url: null, duration_s: 100, thumbnail_path: null,
    view_count: null, like_count: null, published_at: null, metadata_json: null,
    download_status: "none",
  };
  return insertMedia(db, m).id;
}
function transcript(mediaId: number, overrides: Partial<NewTranscript> = {}): NewTranscript {
  return {
    media_id: mediaId, provider_id: "ytdlp-subs", language: "en",
    text: "hello world", segments_json: "[]", model: null, ...overrides,
  };
}

describe("transcript queries", () => {
  let db: SiftDatabase;
  beforeEach(async () => { db = await openTestDatabase(); runMigrations(db); });

  it("inserts and reads back a transcript with generated id and timestamp", () => {
    const mid = media(db);
    const row = insertTranscript(db, transcript(mid));
    expect(row.id).toBeGreaterThan(0);
    expect(row.media_id).toBe(mid);
    expect(row.created_at).toBeGreaterThan(0);
    const got = getTranscriptsByMediaId(db, mid);
    expect(got).toHaveLength(1);
    expect(got[0]!.text).toBe("hello world");
    expect(got[0]!.provider_id).toBe("ytdlp-subs");
  });

  it("getTranscriptsByMediaId returns newest first, scoped to the media id", () => {
    const a = media(db, "https://y/a");
    const b = media(db, "https://y/b");
    insertTranscript(db, transcript(a, { text: "A1" }));
    insertTranscript(db, transcript(a, { text: "A2" }));
    insertTranscript(db, transcript(b, { text: "B1" }));
    expect(getTranscriptsByMediaId(db, a).map((r) => r.text)).toEqual(["A2", "A1"]);
    expect(getTranscriptsByMediaId(db, b).map((r) => r.text)).toEqual(["B1"]);
  });
});
