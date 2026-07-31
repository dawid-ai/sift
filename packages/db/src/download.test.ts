import { beforeEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import {
  runMigrations,
  insertMedia,
  insertTranscript,
  getTranscriptById,
  deleteTranscript,
  insertSummary,
  getSummaryById,
  deleteSummary,
  insertDownload,
  getDownloadById,
  getDownloadByMediaAndFormat,
  listDownloadsByMediaId,
  upsertDownload,
  setDownloadStatus,
  deleteDownload,
  resetDownloadingToError,
  downloadExistsByFilePath,
} from "./index";
import type { SiftDatabase, NewMedia, NewDownload, NewTranscript, NewSummary } from "./index";

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

describe("download queries", () => {
  let db: SiftDatabase;
  beforeEach(async () => {
    db = await openTestDatabase();
    runMigrations(db);
  });

  it("inserts and reads back a download row with generated id and timestamps", () => {
    const m = insertMedia(db, sampleMedia());
    const row = insertDownload(db, sampleDownload(m.id));
    expect(row.id).toBeGreaterThan(0);
    expect(row.media_id).toBe(m.id);
    expect(row.format_id).toBe("1080p");
    expect(row.status).toBe("downloading");
    expect(row.created_at).toBeGreaterThan(0);
    expect(row.updated_at).toBeGreaterThan(0);
    expect(getDownloadById(db, row.id)?.label).toBe("1080p");
  });

  it("getDownloadByMediaAndFormat finds the row for a (media_id, format_id) pair", () => {
    const m = insertMedia(db, sampleMedia());
    const row = insertDownload(db, sampleDownload(m.id));
    const found = getDownloadByMediaAndFormat(db, m.id, "1080p");
    expect(found?.id).toBe(row.id);
    expect(getDownloadByMediaAndFormat(db, m.id, "audio")).toBeUndefined();
  });

  it("listDownloadsByMediaId returns newest first", () => {
    const m = insertMedia(db, sampleMedia());
    const a = insertDownload(db, sampleDownload(m.id, { format_id: "1080p" }));
    const b = insertDownload(db, sampleDownload(m.id, { format_id: "audio" }));
    const ids = listDownloadsByMediaId(db, m.id).map((r) => r.id);
    expect(ids).toEqual([b.id, a.id]);
    expect(a.id).toBeLessThan(b.id);
  });

  it("upsertDownload replaces the same (media, format) and adds a new format", () => {
    const m = insertMedia(db, sampleMedia());
    upsertDownload(db, sampleDownload(m.id, { status: "downloading" }));
    upsertDownload(
      db,
      sampleDownload(m.id, { file_path: "/a.mp4", file_size: 10, status: "done" }),
    );
    upsertDownload(
      db,
      sampleDownload(m.id, {
        format_id: "audio",
        label: "Audio",
        ext: "m4a",
        height: null,
        file_path: "/a.m4a",
        file_size: 5,
        status: "done",
      }),
    );
    const rows = listDownloadsByMediaId(db, m.id);
    expect(rows).toHaveLength(2);
    const hd = rows.find((r) => r.format_id === "1080p")!;
    expect(hd.status).toBe("done");
    expect(hd.file_path).toBe("/a.mp4");
    expect(hd.file_size).toBe(10);
    const audio = rows.find((r) => r.format_id === "audio")!;
    expect(audio.status).toBe("done");
    expect(audio.file_path).toBe("/a.m4a");
  });

  it("setDownloadStatus updates status/path/size/error and bumps updated_at", () => {
    const m = insertMedia(db, sampleMedia());
    const row = insertDownload(db, sampleDownload(m.id));
    setDownloadStatus(db, row.id, "error", null, null, "network fail");
    const after = getDownloadById(db, row.id)!;
    expect(after.status).toBe("error");
    expect(after.file_path).toBeNull();
    expect(after.file_size).toBeNull();
    expect(after.error).toBe("network fail");
    expect(after.updated_at).toBeGreaterThanOrEqual(row.updated_at);
  });

  it("deleteDownload removes a row by id", () => {
    const m = insertMedia(db, sampleMedia());
    const a = insertDownload(db, sampleDownload(m.id, { format_id: "1080p" }));
    const b = insertDownload(db, sampleDownload(m.id, { format_id: "audio" }));
    deleteDownload(db, a.id);
    expect(getDownloadById(db, a.id)).toBeUndefined();
    expect(listDownloadsByMediaId(db, m.id).map((r) => r.id)).toEqual([b.id]);
  });

  it("resetDownloadingToError flips only downloading rows to error and returns the count", () => {
    const m = insertMedia(db, sampleMedia());
    const downloading1 = insertDownload(db, sampleDownload(m.id, { format_id: "1080p", status: "downloading" }));
    const downloading2 = insertDownload(db, sampleDownload(m.id, { format_id: "audio", status: "downloading" }));
    const done = insertDownload(db, sampleDownload(m.id, { format_id: "720p", status: "done" }));
    const changed = resetDownloadingToError(db);
    expect(changed).toBe(2);
    expect(getDownloadById(db, downloading1.id)?.status).toBe("error");
    expect(getDownloadById(db, downloading2.id)?.status).toBe("error");
    expect(getDownloadById(db, done.id)?.status).toBe("done");
  });

  it("downloadExistsByFilePath is true only for a stored file_path", () => {
    const m = insertMedia(db, sampleMedia());
    insertDownload(db, sampleDownload(m.id, {
      format_id: "22",
      label: "720p",
      ext: "mp4",
      height: 720,
      file_path: "C:\\videos\\a.mp4",
      file_size: 100,
      status: "done",
      error: null,
    }));
    expect(downloadExistsByFilePath(db, "C:\\videos\\a.mp4")).toBe(true);
    expect(downloadExistsByFilePath(db, "C:\\videos\\missing.mp4")).toBe(false);
  });

  it("deleteTranscript removes a transcript row by id", () => {
    const m = insertMedia(db, sampleMedia());
    const t: NewTranscript = {
      media_id: m.id,
      provider_id: "youtube",
      language: "en",
      text: "hello",
      segments_json: null,
      model: null,
    };
    const row = insertTranscript(db, t);
    deleteTranscript(db, row.id);
    expect(getTranscriptById(db, row.id)).toBeUndefined();
  });

  it("deleteSummary removes a summary row by id", () => {
    const m = insertMedia(db, sampleMedia());
    const s: NewSummary = {
      media_id: m.id,
      prompt_id: null,
      provider_id: "anthropic",
      model: "claude",
      text: "summary text",
    };
    const row = insertSummary(db, s);
    deleteSummary(db, row.id);
    expect(getSummaryById(db, row.id)).toBeUndefined();
  });
});
