import { beforeEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "@sift/db/testing";
import {
  insertMedia,
  listDownloadsByMediaId,
  runMigrations,
  upsertDownload,
  type NewDownload,
  type NewMedia,
  type SiftDatabase,
} from "@sift/db";
import { resetStaleDownloads } from "./maintenance";

function sampleMedia(overrides: Partial<NewMedia> = {}): NewMedia {
  return {
    source_url: "https://x/1",
    platform_id: "youtube",
    external_id: null,
    title: "t",
    uploader: null,
    uploader_url: null,
    duration_s: null,
    thumbnail_path: null,
    view_count: null,
    like_count: null,
    published_at: null,
    metadata_json: null,
    download_status: "none",
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

describe("resetStaleDownloads", () => {
  let db: SiftDatabase;
  beforeEach(async () => {
    db = await openTestDatabase();
    runMigrations(db);
  });

  it("flips only downloading download rows to error and returns the count", () => {
    const m = insertMedia(db, sampleMedia());
    upsertDownload(db, sampleDownload(m.id, { format_id: "1080p", status: "downloading" }));
    upsertDownload(db, sampleDownload(m.id, { format_id: "720p", status: "done" }));
    upsertDownload(db, sampleDownload(m.id, { format_id: "audio", status: "error" }));

    const changed = resetStaleDownloads(db);

    expect(changed).toBe(1);
    const byFormat = Object.fromEntries(
      listDownloadsByMediaId(db, m.id).map((d) => [d.format_id, d.status]),
    );
    expect(byFormat["1080p"]).toBe("error");
    expect(byFormat["720p"]).toBe("done");
    expect(byFormat["audio"]).toBe("error");
  });
});
