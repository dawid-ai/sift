import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openTestDatabase } from "@sift/db/testing";
import {
  insertDownload,
  insertMedia,
  runMigrations,
  type SiftDatabase,
} from "@sift/db";
import { ClipService } from "./clip-service";

let db: SiftDatabase;
let dir: string;
let calls: string[][];

function media(url: string): number {
  return insertMedia(db, {
    source_url: url,
    platform_id: "youtube",
    external_id: "abc",
    title: "A Talk: Part 1",
    uploader: "Chan",
    uploader_url: null,
    duration_s: 600,
    thumbnail_path: null,
    view_count: null,
    like_count: null,
    published_at: null,
    metadata_json: "{}",
    download_status: "done",
  }).id;
}

function withFile(mediaId: number, filePath: string | null, status = "done") {
  insertDownload(db, {
    media_id: mediaId,
    format_id: "1080p",
    label: "1080p",
    ext: "mp4",
    height: 1080,
    file_path: filePath,
    file_size: 10,
    status,
    error: null,
  });
}

function service() {
  return new ClipService({
    db,
    outputDir: () => dir,
    runFfmpeg: async (args) => {
      calls.push(args);
    },
  });
}

beforeEach(async () => {
  db = await openTestDatabase();
  runMigrations(db);
  dir = mkdtempSync(join(tmpdir(), "sift-clip-"));
  calls = [];
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("link", () => {
  it("returns a timestamped URL for a platform that supports one", () => {
    const id = media("https://www.youtube.com/watch?v=abc");
    expect(service().link(id, 90)).toContain("t=90s");
  });

  it("returns null rather than a link that would silently start from zero", () => {
    const id = media("https://example.com/video/1");
    expect(service().link(id, 90)).toBeNull();
  });

  it("throws for an unknown media id", () => {
    expect(() => service().link(999, 0)).toThrow(/No media/);
  });
});

describe("export", () => {
  it("cuts the requested span from the completed download", async () => {
    const id = media("https://y/1");
    withFile(id, "C:/media/talk.mp4");
    const result = await service().export({
      mediaId: id,
      kind: "video",
      range: { startSeconds: 30, endSeconds: 45 },
    });

    expect(calls).toHaveLength(1);
    const args = calls[0]!;
    expect(args).toContain("C:/media/talk.mp4");
    expect(args[args.indexOf("-ss") + 1]).toBe("30.000");
    expect(args[args.indexOf("-t") + 1]).toBe("15.000");
    expect(result.path.endsWith(".mp4")).toBe(true);
    // The span is in the filename, so two clips of one video don't collide.
    expect(result.path).toContain("30-45");
  });

  it("picks the download that has a file, not merely the first row", async () => {
    const id = media("https://y/1");
    withFile(id, null, "error");
    withFile(id, "C:/media/real.mp4");
    await service().export({
      mediaId: id,
      kind: "audio",
      range: { startSeconds: 0, endSeconds: 5 },
    });
    expect(calls[0]).toContain("C:/media/real.mp4");
  });

  it("refuses when nothing is on disk, naming the fix", async () => {
    const id = media("https://y/1");
    withFile(id, null, "error");
    await expect(
      service().export({
        mediaId: id,
        kind: "video",
        range: { startSeconds: 0, endSeconds: 5 },
      }),
    ).rejects.toThrow(/Download this video first/);
    expect(calls).toHaveLength(0);
  });

  it("refuses a span too short to cut", async () => {
    const id = media("https://y/1");
    withFile(id, "C:/media/talk.mp4");
    await expect(
      service().export({
        mediaId: id,
        kind: "video",
        range: { startSeconds: 10, endSeconds: 10 },
      }),
    ).rejects.toThrow(/longer span/);
  });

  it("marks a vertical short in its filename and re-encodes it", async () => {
    const id = media("https://y/1");
    withFile(id, "C:/media/talk.mp4");
    const result = await service().export({
      mediaId: id,
      kind: "vertical",
      range: { startSeconds: 0, endSeconds: 20 },
    });
    expect(result.path).toContain("vertical");
    expect(calls[0]).toContain("libx264");
  });

  it("sanitises the title into the filename", async () => {
    const id = media("https://y/1");
    withFile(id, "C:/media/talk.mp4");
    const result = await service().export({
      mediaId: id,
      kind: "audio",
      range: { startSeconds: 0, endSeconds: 5 },
    });
    // The colon in "A Talk: Part 1" is not legal in a Windows filename.
    expect(result.path).not.toContain(":\\A Talk:");
    expect(result.path.endsWith(".m4a")).toBe(true);
  });
});
