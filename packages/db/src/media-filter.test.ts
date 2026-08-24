import { describe, it, expect, beforeEach } from "vitest";
import { openTestDatabase } from "./testing";
import type { SiftDatabase } from "./database";
import { runMigrations } from "./migrations";
import { findDuplicates, insertMedia, listMediaIds } from "./media";
import { insertTranscript } from "./transcript";
import { insertSummary } from "./summary";
import { createPrompt } from "./prompt";

interface Opts {
  title?: string;
  externalId?: string | null;
  duration?: number | null;
  published?: number | null;
  status?: string;
  platform?: string;
}

function media(db: SiftDatabase, o: Opts = {}): number {
  const title = o.title ?? "Vid";
  return insertMedia(db, {
    source_url: `https://y/${title}-${Math.random()}`,
    platform_id: o.platform ?? "youtube",
    external_id: o.externalId === undefined ? title : o.externalId,
    title,
    uploader: "Chan",
    uploader_url: null,
    duration_s: o.duration === undefined ? 100 : o.duration,
    thumbnail_path: null,
    view_count: null,
    like_count: null,
    published_at: o.published ?? null,
    metadata_json: "{}",
    download_status: o.status ?? "none",
  }).id;
}

let db: SiftDatabase;
beforeEach(async () => {
  db = await openTestDatabase();
  runMigrations(db);
});

describe("duration filter", () => {
  it("bounds inclusively at both ends", () => {
    const short = media(db, { title: "short", duration: 60 });
    const mid = media(db, { title: "mid", duration: 300 });
    const long = media(db, { title: "long", duration: 3600 });
    expect(listMediaIds(db, { durationMax: 300 }).sort()).toEqual(
      [short, mid].sort(),
    );
    expect(listMediaIds(db, { durationMin: 300 }).sort()).toEqual(
      [mid, long].sort(),
    );
    expect(listMediaIds(db, { durationMin: 61, durationMax: 3599 })).toEqual([
      mid,
    ]);
  });

  it("excludes rows with an unknown duration rather than treating them as zero", () => {
    const known = media(db, { title: "known", duration: 60 });
    media(db, { title: "unknown", duration: null });
    expect(listMediaIds(db, { durationMax: 600 })).toEqual([known]);
  });
});

describe("published-date filter", () => {
  it("is separate from the created_at filter", () => {
    const old = media(db, { title: "old", published: 1_000 });
    const recent = media(db, { title: "recent", published: 9_000 });
    expect(listMediaIds(db, { publishedFrom: 5_000 })).toEqual([recent]);
    expect(listMediaIds(db, { publishedTo: 5_000 })).toEqual([old]);
    // Both rows were created now, so a created_at window still returns both.
    expect(listMediaIds(db, { from: 1 })).toHaveLength(2);
  });

  it("excludes rows with no publish date", () => {
    media(db, { title: "nopub", published: null });
    expect(listMediaIds(db, { publishedFrom: 1 })).toEqual([]);
  });
});

describe("smart filters", () => {
  it("finds rows missing a transcript", () => {
    const withT = media(db, { title: "has" });
    const without = media(db, { title: "hasnt" });
    insertTranscript(db, {
      media_id: withT,
      provider_id: "ytdlp-subs",
      language: "en",
      text: "hello",
      segments_json: null,
      model: null,
    });
    expect(listMediaIds(db, { missing: "transcript" })).toEqual([without]);
  });

  it("finds rows missing a summary", () => {
    const withS = media(db, { title: "has" });
    const without = media(db, { title: "hasnt" });
    const prompt = createPrompt(db, { name: "p", body: "b" });
    insertSummary(db, {
      media_id: withS,
      prompt_id: prompt.id,
      provider_id: "anthropic",
      model: "m",
      text: "sum",
    });
    expect(listMediaIds(db, { missing: "summary" })).toEqual([without]);
  });

  it("finds rows with no completed download", () => {
    const done = media(db, { title: "done", status: "done" });
    db.prepare("UPDATE media SET download_path = ? WHERE id = ?").run(
      "C:/x.mp4",
      done,
    );
    const failed = media(db, { title: "failed", status: "error" });
    const never = media(db, { title: "never", status: "none" });
    expect(listMediaIds(db, { missing: "download" }).sort()).toEqual(
      [failed, never].sort(),
    );
  });

  it("filters by exact download status, which is the failed-download filter", () => {
    const failed = media(db, { title: "failed", status: "error" });
    media(db, { title: "ok", status: "done" });
    expect(listMediaIds(db, { downloadStatus: "error" })).toEqual([failed]);
  });

  it("combines with the other filters rather than replacing them", () => {
    media(db, { title: "shortNoSum", duration: 60 });
    const longNoSum = media(db, { title: "longNoSum", duration: 6000 });
    expect(listMediaIds(db, { missing: "summary", durationMin: 600 })).toEqual([
      longNoSum,
    ]);
  });
});

describe("findDuplicates", () => {
  it("groups rows sharing a platform and external id", () => {
    const a = media(db, { title: "A", externalId: "same" });
    const b = media(db, { title: "B", externalId: "same" });
    const groups = findDuplicates(db);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.reason).toBe("same-source");
    expect(groups[0]?.ids.sort()).toEqual([a, b].sort());
  });

  it("does not group across platforms with a coincidentally equal id", () => {
    media(db, { title: "A", externalId: "x", platform: "youtube" });
    media(db, { title: "B", externalId: "x", platform: "vimeo" });
    expect(findDuplicates(db)).toEqual([]);
  });

  it("groups same title and duration for re-uploads, ignoring case", () => {
    const a = media(db, { title: "Talk", externalId: "one", duration: 500 });
    const b = media(db, { title: "talk", externalId: "two", duration: 500 });
    const groups = findDuplicates(db);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.reason).toBe("same-title-duration");
    expect(groups[0]?.ids.sort()).toEqual([a, b].sort());
  });

  it("does not report the same pair twice under both reasons", () => {
    media(db, { title: "Same", externalId: "dup", duration: 500 });
    media(db, { title: "Same", externalId: "dup", duration: 500 });
    const groups = findDuplicates(db);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.reason).toBe("same-source");
  });

  it("ignores a differing duration and a missing external id", () => {
    media(db, { title: "Same", externalId: "one", duration: 500 });
    media(db, { title: "Same", externalId: "two", duration: 501 });
    media(db, { title: "Blank", externalId: null, duration: null });
    media(db, { title: "Blank", externalId: null, duration: null });
    expect(findDuplicates(db)).toEqual([]);
  });

  it("is empty on a library with nothing repeated", () => {
    media(db, { title: "one" });
    media(db, { title: "two" });
    expect(findDuplicates(db)).toEqual([]);
  });
});
