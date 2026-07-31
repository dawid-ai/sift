import { describe, it, expect, beforeEach } from "vitest";
import { openTestDatabase } from "./testing";
import type { SiftDatabase, NewMedia, NewDownload } from "./index";
import { runMigrations, insertMedia, upsertDownload } from "./index";
import { listPlaylistEntries } from "./playlist";

function sampleMedia(overrides: Partial<NewMedia> = {}): NewMedia {
  return {
    source_url: "https://y/1", platform_id: "youtube", external_id: "abc",
    title: "Vid", uploader: "Chan", uploader_url: null, duration_s: 100,
    thumbnail_path: "https://y/thumb.jpg", view_count: 5, like_count: 1,
    published_at: null, metadata_json: "{}", download_status: "downloading",
    ...overrides,
  };
}

function sampleDownload(mediaId: number, overrides: Partial<NewDownload> = {}): NewDownload {
  return {
    media_id: mediaId,
    format_id: "1080p",
    label: "1080p",
    ext: "mp4",
    height: 1080,
    file_path: null,
    file_size: null,
    status: "downloading",
    error: null,
    ...overrides,
  };
}

function addMedia(db: SiftDatabase, over: Partial<{ url: string; title: string; uploader: string; duration: number }> = {}): number {
  const overrides: Partial<NewMedia> = { source_url: over.url ?? `https://y/${Math.random()}` };
  if (over.title !== undefined) overrides.title = over.title;
  if (over.uploader !== undefined) overrides.uploader = over.uploader;
  if (over.duration !== undefined) overrides.duration_s = over.duration;
  const row = insertMedia(db, sampleMedia(overrides));
  return row.id;
}

function addDownload(
  db: SiftDatabase,
  mediaId: number,
  over: Partial<{ formatId: string; filePath: string | null; status: string }> = {},
): number {
  const overrides: Partial<NewDownload> = {};
  if (over.formatId !== undefined) overrides.format_id = over.formatId;
  if ("filePath" in over) overrides.file_path = over.filePath;
  if (over.status !== undefined) overrides.status = over.status;
  const row = upsertDownload(db, sampleDownload(mediaId, overrides));
  return row.id;
}

describe("listPlaylistEntries", () => {
  let db: SiftDatabase;
  beforeEach(async () => {
    db = await openTestDatabase();
    runMigrations(db);
  });

  it("returns [] for empty ids", () => {
    expect(listPlaylistEntries(db, [])).toEqual([]);
  });

  it("returns a downloaded media's file with title/uploader/duration", () => {
    const id = addMedia(db, { title: "T", uploader: "U", duration: 123 });
    addDownload(db, id, { filePath: "C:/dl/a.mp4", status: "done" });
    expect(listPlaylistEntries(db, [id])).toEqual([
      { mediaId: id, title: "T", uploader: "U", durationSec: 123, filePath: "C:/dl/a.mp4" },
    ]);
  });

  it("excludes media with no done download", () => {
    const a = addMedia(db, { title: "A" });
    addDownload(db, a, { filePath: "C:/dl/a.mp4", status: "done" });
    const b = addMedia(db, { title: "B" });
    addDownload(db, b, { filePath: "C:/dl/b.mp4", status: "downloading" });
    const c = addMedia(db, { title: "C" }); // no download at all
    expect(listPlaylistEntries(db, [a, b, c]).map((e) => e.mediaId)).toEqual([a]);
  });

  it("excludes done downloads with a null file_path", () => {
    const a = addMedia(db, { title: "A" });
    addDownload(db, a, { filePath: null, status: "done" });
    expect(listPlaylistEntries(db, [a])).toEqual([]);
  });

  it("picks the newest done download when a media has several", () => {
    const a = addMedia(db, { title: "A" });
    addDownload(db, a, { formatId: "137", filePath: "C:/dl/old.mp4", status: "done" });
    addDownload(db, a, { formatId: "248", filePath: "C:/dl/new.mp4", status: "done" });
    expect(listPlaylistEntries(db, [a])[0]!.filePath).toBe("C:/dl/new.mp4");
  });

  it("restricts to the given id set", () => {
    const a = addMedia(db, { title: "A" });
    addDownload(db, a, { filePath: "C:/dl/a.mp4", status: "done" });
    const b = addMedia(db, { title: "B" });
    addDownload(db, b, { filePath: "C:/dl/b.mp4", status: "done" });
    expect(listPlaylistEntries(db, [b]).map((e) => e.mediaId)).toEqual([b]);
  });
});
