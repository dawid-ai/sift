import { beforeEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import { runMigrations, insertMedia, insertTranscript, insertSummary } from "./index";
import type { SiftDatabase, NewMedia, NewTranscript, NewSummary } from "./index";
import { searchMedia } from "./search";

function addMedia(db: SiftDatabase, overrides: Partial<NewMedia> = {}): number {
  const m: NewMedia = {
    source_url: "https://y/1", platform_id: "youtube", external_id: "abc",
    title: "Vid", uploader: "Chan", uploader_url: null, duration_s: 100,
    thumbnail_path: null, view_count: null, like_count: null,
    published_at: null, metadata_json: null, download_status: "none",
    ...overrides,
  };
  return insertMedia(db, m).id;
}

function transcript(mediaId: number, overrides: Partial<NewTranscript> = {}): NewTranscript {
  return {
    media_id: mediaId, provider_id: "ytdlp-subs", language: "en",
    text: "hello world", segments_json: "[]", model: null, ...overrides,
  };
}

function summary(mediaId: number, overrides: Partial<NewSummary> = {}): NewSummary {
  return {
    media_id: mediaId, prompt_id: null, provider_id: "anthropic", model: "claude-sonnet",
    text: "summary text", ...overrides,
  };
}

describe("searchMedia", () => {
  let db: SiftDatabase;
  beforeEach(async () => {
    db = await openTestDatabase();
    runMigrations(db);
  });

  it("returns [] for empty/whitespace query", () => {
    expect(searchMedia(db, "")).toEqual([]);
    expect(searchMedia(db, "   ")).toEqual([]);
  });

  it("matches title (case-insensitive), snippet null", () => {
    const id = addMedia(db, { title: "The Quick Brown Fox" });
    const hits = searchMedia(db, "quick");
    expect(hits).toEqual([{ mediaId: id, field: "title", snippet: null }]);
  });

  it("matches uploader, snippet null", () => {
    const id = addMedia(db, { title: "x", uploader: "Veritasium" });
    expect(searchMedia(db, "verita")[0]).toMatchObject({ mediaId: id, field: "uploader", snippet: null });
  });

  it("matches transcript text with a bounded snippet containing the term", () => {
    const id = addMedia(db, { title: "x" });
    insertTranscript(
      db,
      transcript(id, {
        text: "In this video we discuss the process of photosynthesis in great detail throughout.",
      }),
    );
    const hit = searchMedia(db, "photosynthesis")[0]!;
    expect(hit).toMatchObject({ mediaId: id, field: "transcript" });
    expect(hit.snippet).toContain("photosynthesis");
    expect(hit.snippet!.length).toBeLessThanOrEqual(84); // ~80 + ellipses
  });

  it("matches summary text when title/uploader/transcript do not", () => {
    const id = addMedia(db, { title: "x", uploader: "y" });
    insertSummary(db, summary(id, { text: "The cell contains a mitochondria which produces energy." }));
    expect(searchMedia(db, "mitochondria")[0]).toMatchObject({ mediaId: id, field: "summary" });
  });

  it("prefers title over transcript when both match", () => {
    const id = addMedia(db, { title: "photosynthesis basics" });
    insertTranscript(db, transcript(id, { text: "today we cover photosynthesis in depth" }));
    expect(searchMedia(db, "photosynthesis")[0]).toMatchObject({ field: "title", snippet: null });
  });

  it("returns nothing when no field matches", () => {
    addMedia(db, { title: "unrelated" });
    expect(searchMedia(db, "zzz")).toEqual([]);
  });
});
