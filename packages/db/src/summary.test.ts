import { beforeEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import {
  runMigrations,
  insertMedia,
  insertSummary,
  getSummaryById,
  getSummariesByMediaId,
  listPrompts,
} from "./index";
import type { SiftDatabase, NewMedia, NewSummary } from "./index";

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
function summary(
  mediaId: number,
  overrides: Partial<NewSummary> = {},
): NewSummary {
  return {
    media_id: mediaId,
    prompt_id: null,
    provider_id: "anthropic",
    model: "claude-sonnet",
    text: "summary text",
    ...overrides,
  };
}

describe("summary queries", () => {
  let db: SiftDatabase;
  beforeEach(async () => {
    db = await openTestDatabase();
    runMigrations(db);
  });

  it("inserts and reads back a summary with a prompt_id, generated id and timestamp", () => {
    const mid = media(db);
    const promptId = listPrompts(db)[0]!.id;
    const row = insertSummary(db, summary(mid, { prompt_id: promptId }));
    expect(row.id).toBeGreaterThan(0);
    expect(row.media_id).toBe(mid);
    expect(row.prompt_id).toBe(promptId);
    expect(row.created_at).toBeGreaterThan(0);
    const got = getSummaryById(db, row.id);
    expect(got?.text).toBe("summary text");
    expect(got?.model).toBe("claude-sonnet");
    expect(got?.provider_id).toBe("anthropic");
    expect(got?.created_at).toBeGreaterThan(0);
  });

  it("inserts fine with a null prompt_id", () => {
    const mid = media(db);
    const row = insertSummary(db, summary(mid, { prompt_id: null }));
    expect(row.prompt_id).toBeNull();
  });

  it("getSummariesByMediaId returns newest first, scoped to the media id", () => {
    const a = media(db, "https://y/a");
    const b = media(db, "https://y/b");
    insertSummary(db, summary(a, { text: "A1" }));
    insertSummary(db, summary(a, { text: "A2" }));
    insertSummary(db, summary(b, { text: "B1" }));
    expect(getSummariesByMediaId(db, a).map((r) => r.text)).toEqual([
      "A2",
      "A1",
    ]);
    expect(getSummariesByMediaId(db, b).map((r) => r.text)).toEqual(["B1"]);
  });
});
