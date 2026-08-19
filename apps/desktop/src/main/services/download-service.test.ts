import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOCAL_TAG } from "@sift/core";
import { openTestDatabase } from "@sift/db/testing";
import {
  addTag,
  createPrompt,
  getMediaById,
  getSummariesByMediaId,
  getTranscriptsByMediaId,
  insertDownload,
  insertMedia,
  insertSummary,
  insertTranscript,
  listDownloadsByMediaId,
  listMedia,
  runMigrations,
  tagsForMedia,
  upsertAsset,
} from "@sift/db";
import type {
  DownloadOption,
  DownloadProgress,
  MediaMetadata,
} from "@sift/ipc-contract";
import type {
  DownloadOpts,
  RawDownloadProgress,
  YtDlpRunner,
} from "../sidecars/ytdlp";
import { LOCAL_FORMAT_ID } from "../local-file";
import { DownloadService, downloadDisplayLabel } from "./download-service";

describe("downloadDisplayLabel", () => {
  it("returns the stored label for non-legacy (real) downloads", () => {
    expect(
      downloadDisplayLabel({
        format_id: "1080p",
        label: "1080p",
        file_path: "/x [1080p].mp4",
      }),
    ).toBe("1080p");
    expect(
      downloadDisplayLabel({
        format_id: "audio",
        label: "Audio only",
        file_path: "/x.m4a",
      }),
    ).toBe("Audio only");
  });

  it("recovers the quality from a legacy download's filename", () => {
    expect(
      downloadDisplayLabel({
        format_id: "legacy",
        label: "Downloaded",
        file_path: "C:\\vids\\Chan__Title [1080p].mp4",
      }),
    ).toBe("1080p");
    expect(
      downloadDisplayLabel({
        format_id: "legacy",
        label: "Downloaded",
        file_path: "/vids/Chan__Title [720p].webm",
      }),
    ).toBe("720p");
    expect(
      downloadDisplayLabel({
        format_id: "legacy",
        label: "Downloaded",
        file_path: "/vids/Chan__Title [audio].m4a",
      }),
    ).toBe("Audio");
  });

  it("falls back to the container extension when the quality isn't encoded", () => {
    expect(
      downloadDisplayLabel({
        format_id: "legacy",
        label: "Downloaded",
        file_path: "/vids/Chan__Title [best].mp4",
      }),
    ).toBe("MP4");
    expect(
      downloadDisplayLabel({
        format_id: "legacy",
        label: "Downloaded",
        file_path: "/vids/plain-name.webm",
      }),
    ).toBe("WEBM");
  });

  it("keeps 'Downloaded' only when there is no file path to learn from", () => {
    expect(
      downloadDisplayLabel({
        format_id: "legacy",
        label: "Downloaded",
        file_path: null,
      }),
    ).toBe("Downloaded");
  });
});

const OPTION: DownloadOption = {
  id: "1080p",
  label: "1080p",
  detail: "MP4",
  selector:
    "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b",
  approxBytes: 345_000_000,
  kind: "video",
};

const OPTION_AUDIO: DownloadOption = {
  id: "audio",
  label: "Audio only",
  detail: "M4A",
  selector: "ba[ext=m4a]/ba",
  approxBytes: 12_000_000,
  kind: "audio",
};

const metadata: MediaMetadata = {
  sourceUrl: "https://example.com/watch?v=abc123",
  platform: { id: "youtube", label: "YouTube", tier: "tested" },
  externalId: "abc123",
  title: "Vid",
  uploader: "Chan",
  uploaderUrl: "https://example.com/chan",
  channelId: null,
  durationSec: 120,
  thumbnailUrl: "https://example.com/thumb.jpg",
  viewCount: 100,
  likeCount: 10,
  uploadDate: "20240101",
  hasCaptions: true,
  language: null,
  captionLanguages: ["en"],
  formats: [OPTION, OPTION_AUDIO],
  raw: { some: "raw-field" },
};

const PROGRESS_TICKS: RawDownloadProgress[] = [
  { received: 512, total: 2048, speed: 512, eta: 3 },
  { received: 2048, total: 2048, speed: 0, eta: 0 },
];

/** A fake `YtDlpRunner` whose `download` records its args and either resolves with a
 * (queued, defaulting to fixed) fake path after emitting two progress ticks, or rejects. */
function makeFakeRunner(
  behavior: { rejectWith?: Error; filePaths?: string[] } = {},
): {
  runner: YtDlpRunner;
  calls: DownloadOpts[];
} {
  const calls: DownloadOpts[] = [];
  const paths = behavior.filePaths ?? ["/dl/Chan__Vid.mp4"];
  let callIndex = 0;
  const runner: YtDlpRunner = {
    async dumpJson(): Promise<unknown> {
      throw new Error("not used in this test");
    },
    async flatPlaylist(): Promise<unknown> {
      throw new Error("not used in this test");
    },
    async listExtractors(): Promise<string[]> {
      throw new Error("not used in this test");
    },
    async download(
      opts: DownloadOpts,
      onProgress: (p: RawDownloadProgress) => void,
    ): Promise<{ filePath: string }> {
      calls.push(opts);
      for (const tick of PROGRESS_TICKS) onProgress(tick);
      if (behavior.rejectWith) throw behavior.rejectWith;
      const filePath = paths[Math.min(callIndex, paths.length - 1)]!;
      callIndex += 1;
      return { filePath };
    },
    async fetchSubtitles(): Promise<{
      subPath: string;
      format: "json3" | "vtt";
    } | null> {
      throw new Error("not used in this test");
    },
  };
  return { runner, calls };
}

let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** Builds a `DownloadService` wired with fake fileExists/unlinkFile spies, returning
 * both so tests can assert on unlink calls without touching real disk. */
function makeService(opts: {
  db: Awaited<ReturnType<typeof openTestDatabase>>;
  runner: YtDlpRunner;
  downloadsDir: string;
}): { service: DownloadService; unlinked: string[] } {
  const unlinked: string[] = [];
  const service = new DownloadService({
    ...opts,
    downloadsDir: () => opts.downloadsDir,
    binariesDir: "/test/binaries",
    fileExists: () => true,
    unlinkFile: (p) => unlinked.push(p),
  });
  return { service, unlinked };
}

describe("DownloadService", () => {
  it("start() creates a media row + a download row (downloading -> done), forwarding progress", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner, calls } = makeFakeRunner();
    const { service } = makeService({ db, runner, downloadsDir });

    const progressEvents: DownloadProgress[] = [];
    const record = await service.start({ metadata, option: OPTION }, (p) =>
      progressEvents.push(p),
    );

    const mediaRows = listMedia(db);
    expect(mediaRows).toHaveLength(1);
    const media = mediaRows[0]!;
    expect(media.download_status).toBe("none"); // media is identity-only now

    const dlRows = listDownloadsByMediaId(db, media.id);
    expect(dlRows).toHaveLength(1);
    expect(dlRows[0]!.status).toBe("done");
    expect(dlRows[0]!.file_path).toBe("/dl/Chan__Vid.mp4");
    expect(dlRows[0]!.format_id).toBe(OPTION.id);
    expect(dlRows[0]!.file_size).toBeNull();

    expect(progressEvents).toHaveLength(2);
    for (const p of progressEvents) {
      expect(p.mediaId).toBe(media.id);
      expect(p.downloadId).toBe(dlRows[0]!.id);
    }

    expect(record.downloadStatus).toBe("done");
    expect(record.downloadPath).toBe("/dl/Chan__Vid.mp4");
    expect(record.thumbnailUrl).toBe(metadata.thumbnailUrl);
    expect(record.platformId).toBe(metadata.platform.id);

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.format).toBe(OPTION.selector);
    expect(call.outputTemplate).toContain("Chan__Vid");
    expect(call.outputTemplate).toContain("[1080p]");
    expect(call.outputTemplate.endsWith(".%(ext)s")).toBe(true);

    db.close();
  });

  it("re-start() with the SAME format replaces the file: prior unlinked, one row for that format", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner({
      filePaths: ["/dl/Chan__Vid.mp4", "/dl/Chan__Vid (1).mp4"],
    });
    const { service, unlinked } = makeService({ db, runner, downloadsDir });

    await service.start({ metadata, option: OPTION });
    const record2 = await service.start({ metadata, option: OPTION });

    const mediaRows = listMedia(db);
    expect(mediaRows).toHaveLength(1);

    const dlRows = listDownloadsByMediaId(db, mediaRows[0]!.id);
    expect(dlRows).toHaveLength(1); // upsert on (media_id, format_id) — same row
    expect(dlRows[0]!.file_path).toBe("/dl/Chan__Vid (1).mp4");

    expect(unlinked).toEqual(["/dl/Chan__Vid.mp4"]);
    expect(record2.downloadPath).toBe("/dl/Chan__Vid (1).mp4");

    db.close();
  });

  it("start() with a DIFFERENT format adds a second download row (no unlink)", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner({
      filePaths: ["/dl/Chan__Vid.mp4", "/dl/Chan__Vid.m4a"],
    });
    const { service, unlinked } = makeService({ db, runner, downloadsDir });

    await service.start({ metadata, option: OPTION });
    await service.start({ metadata, option: OPTION_AUDIO });

    const mediaRows = listMedia(db);
    expect(mediaRows).toHaveLength(1); // same media, found by source URL

    const dlRows = listDownloadsByMediaId(db, mediaRows[0]!.id);
    expect(dlRows).toHaveLength(2);
    const byFormat = Object.fromEntries(dlRows.map((d) => [d.format_id, d]));
    expect(byFormat[OPTION.id]!.file_path).toBe("/dl/Chan__Vid.mp4");
    expect(byFormat[OPTION_AUDIO.id]!.file_path).toBe("/dl/Chan__Vid.m4a");

    expect(unlinked).toEqual([]); // different formats never collide/unlink each other

    db.close();
  });

  it("finds-or-reuses the existing media row by source URL (find-or-create)", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner();
    const { service } = makeService({ db, runner, downloadsDir });

    // Simulate a transcript-only row created earlier by TranscriptService.get()'s
    // find-or-create (download_status "none" — media is identity-only).
    const pre = insertMedia(db, {
      source_url: metadata.sourceUrl, // same URL the download will use
      platform_id: metadata.platform.id,
      external_id: metadata.externalId,
      title: metadata.title,
      uploader: metadata.uploader,
      uploader_url: metadata.uploaderUrl,
      duration_s: metadata.durationSec,
      thumbnail_path: metadata.thumbnailUrl,
      view_count: metadata.viewCount,
      like_count: metadata.likeCount,
      published_at: null,
      metadata_json: null,
      download_status: "none",
    });

    await service.start({ metadata, option: OPTION });

    const mediaRows = listMedia(db);
    expect(mediaRows).toHaveLength(1);
    expect(mediaRows[0]!.id).toBe(pre.id);

    const dlRows = listDownloadsByMediaId(db, pre.id);
    expect(dlRows).toHaveLength(1);
    expect(dlRows[0]!.status).toBe("done");

    db.close();
  });

  it("start() marks the download row 'error' and rethrows when the runner rejects", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const boom = new Error("boom");
    const { runner } = makeFakeRunner({ rejectWith: boom });
    const { service } = makeService({ db, runner, downloadsDir });

    await expect(service.start({ metadata, option: OPTION })).rejects.toThrow(
      "boom",
    );

    const mediaRows = listMedia(db);
    expect(mediaRows).toHaveLength(1);
    expect(mediaRows[0]!.download_status).toBe("none"); // media itself is never touched

    const dlRows = listDownloadsByMediaId(db, mediaRows[0]!.id);
    expect(dlRows).toHaveLength(1);
    expect(dlRows[0]!.status).toBe("error");
    expect(dlRows[0]!.error).toBe("boom");
    expect(dlRows[0]!.file_path).toBeNull();

    db.close();
  });

  it("re-start() of an already-downloaded format that then fails keeps the prior working file", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);

    // First start() succeeds normally, landing a "done" row for OPTION.
    const { runner: okRunner } = makeFakeRunner();
    const { service: okService } = makeService({
      db,
      runner: okRunner,
      downloadsDir,
    });
    await okService.start({ metadata, option: OPTION });

    const mediaId = listMedia(db)[0]!.id;
    const before = listDownloadsByMediaId(db, mediaId).find(
      (d) => d.format_id === OPTION.id,
    )!;
    expect(before.status).toBe("done");
    expect(before.file_path).toBe("/dl/Chan__Vid.mp4");

    // Re-start() the SAME format with a runner that rejects.
    const boom = new Error("boom");
    const { runner: failRunner } = makeFakeRunner({ rejectWith: boom });
    const { service: failService, unlinked } = makeService({
      db,
      runner: failRunner,
      downloadsDir,
    });

    await expect(
      failService.start({ metadata, option: OPTION }),
    ).rejects.toThrow("boom");

    const after = listDownloadsByMediaId(db, mediaId).find(
      (d) => d.format_id === OPTION.id,
    )!;
    expect(after.status).toBe("done"); // restored, not "error"
    expect(after.file_path).toBe("/dl/Chan__Vid.mp4"); // original file path, not null
    expect(after.error).toBeNull();

    expect(unlinked).toEqual([]); // the prior working file was never unlinked

    db.close();
  });

  it("marks the download row 'error' and rejects when the output file is missing after download", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner();

    // fileExists → false simulates yt-dlp exiting 0 but the merged file never landing
    // (e.g. a video format requested with no ffmpeg to merge).
    const service = new DownloadService({
      db,
      runner,
      downloadsDir: () => downloadsDir,
      binariesDir: "/test/binaries",
      fileExists: () => false,
      unlinkFile: () => {},
    });

    await expect(service.start({ metadata, option: OPTION })).rejects.toThrow(
      /output file is missing/,
    );

    const mediaRows = listMedia(db);
    const dlRows = listDownloadsByMediaId(db, mediaRows[0]!.id);
    expect(dlRows).toHaveLength(1);
    expect(dlRows[0]!.status).toBe("error");

    db.close();
  });

  it("passes the installed ffmpeg path as ffmpegLocation (undefined when not installed)", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");

    // No ffmpeg asset → ffmpegLocation undefined.
    const db1 = await openTestDatabase();
    runMigrations(db1);
    const r1 = makeFakeRunner();
    const { service: s1 } = makeService({
      db: db1,
      runner: r1.runner,
      downloadsDir,
    });
    await s1.start({ metadata, option: OPTION });
    expect(r1.calls[0]!.ffmpegLocation).toBeUndefined();
    db1.close();

    // ffmpeg asset present → its path is forwarded.
    const db2 = await openTestDatabase();
    runMigrations(db2);
    upsertAsset(db2, {
      kind: "ffmpeg",
      name: "ffmpeg",
      version: "1",
      path: "/bin/ffmpeg",
      sha256: "x",
      installed_at: 1,
      last_checked: 1,
    });
    const r2 = makeFakeRunner();
    const { service: s2 } = makeService({
      db: db2,
      runner: r2.runner,
      downloadsDir,
    });
    await s2.start({ metadata, option: OPTION });
    expect(r2.calls[0]!.ffmpegLocation).toBe("/bin/ffmpeg");
    db2.close();
  });

  it("resolves a RELATIVE stored ffmpeg path against binariesDir before forwarding it to yt-dlp", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);

    // Managed-binary rows store a path RELATIVE to binariesDir (e.g. "ffmpeg.exe"),
    // not an absolute one — the service must join it onto binariesDir itself rather
    // than forwarding the bare relative string (which yt-dlp would treat as relative
    // to its own cwd and silently skip the merge for).
    upsertAsset(db, {
      kind: "ffmpeg",
      name: "ffmpeg",
      version: "1",
      path: "ffmpeg.exe",
      sha256: "x",
      installed_at: 1,
      last_checked: 1,
    });

    const { runner, calls } = makeFakeRunner();
    const service = new DownloadService({
      db,
      runner,
      downloadsDir: () => downloadsDir,
      binariesDir: "/base",
      fileExists: () => true,
      unlinkFile: () => {},
    });

    await service.start({ metadata, option: OPTION });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.ffmpegLocation).toBe(join("/base", "ffmpeg.exe"));
    expect(calls[0]!.ffmpegLocation).not.toBe("ffmpeg.exe");

    db.close();
  });

  it("list() returns a MediaListItem per media: capture summary of formats, transcripts, and summaries", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner({
      filePaths: ["/dl/Chan__Vid.mp4"],
    });
    const { service } = makeService({ db, runner, downloadsDir });
    await service.start({ metadata, option: OPTION });
    const mediaId = listMedia(db)[0]!.id;

    // Second format errors out, giving us one "done" + one "error" download row.
    const boom = new Error("boom");
    const { runner: failRunner } = makeFakeRunner({ rejectWith: boom });
    const { service: failService } = makeService({
      db,
      runner: failRunner,
      downloadsDir,
    });
    await expect(
      failService.start({ metadata, option: OPTION_AUDIO }),
    ).rejects.toThrow("boom");

    insertTranscript(db, {
      media_id: mediaId,
      provider_id: "ytdlp-subs",
      language: "en",
      text: "hi",
      segments_json: null,
      model: null,
    });
    const prompt = createPrompt(db, { name: "P", body: "b {{transcript}}" });
    insertSummary(db, {
      media_id: mediaId,
      prompt_id: prompt.id,
      provider_id: "anthropic",
      model: "x",
      text: "sum",
    });

    const list = await service.list();
    expect(list).toHaveLength(1);
    const item = list[0]!;

    expect(item.media.id).toBe(mediaId);
    expect(item.media.title).toBe(metadata.title);
    expect(item.media.downloadStatus).toBe("done");
    expect(item.media.downloadPath).toBe("/dl/Chan__Vid.mp4");
    expect(item.media.thumbnailUrl).toBe(metadata.thumbnailUrl);
    expect(item.media.platformId).toBe(metadata.platform.id);

    expect(item.transcriptCount).toBe(1);
    expect(item.transcriptLanguage).toBe("en");

    expect(item.formats).toHaveLength(2);
    const byId = Object.fromEntries(item.formats.map((f) => [f.id, f]));
    expect(byId[OPTION.id]).toEqual({
      id: OPTION.id,
      label: OPTION.label,
      status: "done",
    });
    expect(byId[OPTION_AUDIO.id]).toEqual({
      id: OPTION_AUDIO.id,
      label: OPTION_AUDIO.label,
      status: "error",
    });

    expect(item.summaryCount).toBe(1);

    db.close();
  });

  it("list() returns transcriptCount 0 and transcriptLanguage null when no transcripts exist", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner();
    const { service } = makeService({ db, runner, downloadsDir });
    await service.start({ metadata, option: OPTION });

    const list = await service.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.transcriptCount).toBe(0);
    expect(list[0]!.transcriptLanguage).toBeNull();
    expect(list[0]!.summaryCount).toBe(0);
    expect(list[0]!.formats).toHaveLength(1);

    db.close();
  });

  it("detail() returns downloads plus derived media status, transcripts, and summaries, newest first", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner({
      filePaths: ["/dl/Chan__Vid.mp4", "/dl/Chan__Vid.m4a"],
    });
    const { service } = makeService({ db, runner, downloadsDir });

    await service.start({ metadata, option: OPTION });
    await service.start({ metadata, option: OPTION_AUDIO });
    const mediaId = listMedia(db)[0]!.id;

    insertTranscript(db, {
      media_id: mediaId,
      provider_id: "ytdlp-subs",
      language: "en",
      text: "first",
      segments_json: JSON.stringify([{ start: 0, end: 1, text: "first" }]),
      model: null,
    });
    insertTranscript(db, {
      media_id: mediaId,
      provider_id: "whisper",
      language: "en",
      text: "second",
      segments_json: null,
      model: "base",
    });
    const prompt = createPrompt(db, { name: "P", body: "b {{transcript}}" });
    insertSummary(db, {
      media_id: mediaId,
      prompt_id: prompt.id,
      provider_id: "anthropic",
      model: "x",
      text: "sum",
    });

    const d = await service.detail(mediaId);

    expect(d.media.id).toBe(mediaId);
    expect(d.media.downloadStatus).toBe("done");
    expect(d.downloads).toHaveLength(2);
    const formats = d.downloads.map((x) => x.formatId).sort();
    expect(formats).toEqual([OPTION.id, OPTION_AUDIO.id].sort());
    expect(d.transcripts).toHaveLength(2);
    expect(d.transcripts[0]!.text).toBe("second"); // newest first
    expect(d.transcripts[1]!.segments).toEqual([
      { start: 0, end: 1, text: "first" },
    ]);
    expect(d.summaries).toHaveLength(1);
    expect(d.summaries[0]!.promptId).toBe(prompt.id);

    db.close();
  });

  it("detail() rejects when the id doesn't exist", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner();
    const { service } = makeService({ db, runner, downloadsDir });

    await expect(service.detail(9999)).rejects.toThrow();

    db.close();
  });

  it("list() and detail() carry tags", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner();
    const { service: svc } = makeService({ db, runner, downloadsDir });

    const rec = await svc.start({ metadata, option: OPTION });
    addTag(db, rec.id, "Music");
    const list = await svc.list();
    expect(list.find((i) => i.media.id === rec.id)?.tags).toEqual(["Music"]);
    const detail = await svc.detail(rec.id);
    expect(detail.tags).toEqual(["Music"]);

    db.close();
  });

  it("applies tags to the media row on download", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner();
    const { service } = makeService({ db, runner, downloadsDir });

    const rec = await service.start({
      metadata,
      option: OPTION,
      tags: ["news", "ai"],
    });
    expect(new Set(tagsForMedia(db, rec.id))).toEqual(new Set(["news", "ai"]));

    db.close();
  });

  it("search() returns hits from the DB", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner();
    const { service: svc } = makeService({ db, runner, downloadsDir });

    const rec = await svc.start({ metadata, option: OPTION });
    insertTranscript(db, {
      media_id: rec.id,
      provider_id: "ytdlp-subs",
      language: "en",
      text: "a video about kelvin and thermodynamics",
      segments_json: null,
      model: null,
    });

    // Transcript text is opt-in, so the default search must NOT see it and the
    // widened one must.
    expect(await svc.search("kelvin")).toEqual([]);
    const hits = await svc.search("kelvin", true);
    expect(hits.some((h) => h.mediaId === rec.id)).toBe(true);

    db.close();
  });

  it("exportPlaylist writes an m3u of on-disk downloads and counts skips", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);

    // Seed two downloaded media (start() with two different source URLs, same
    // technique as sibling tests): A → file "a.mp4" (kept), B → file "b.mp4" (missing).
    const { runner: runnerA } = makeFakeRunner({ filePaths: ["/dl/a.mp4"] });
    const { service: seedServiceA } = makeService({
      db,
      runner: runnerA,
      downloadsDir,
    });
    const metaA: MediaMetadata = {
      ...metadata,
      sourceUrl: "https://example.com/watch?v=aaa",
    };
    const recA = await seedServiceA.start({ metadata: metaA, option: OPTION });

    const { runner: runnerB } = makeFakeRunner({ filePaths: ["/dl/b.mp4"] });
    const { service: seedServiceB } = makeService({
      db,
      runner: runnerB,
      downloadsDir,
    });
    const metaB: MediaMetadata = {
      ...metadata,
      sourceUrl: "https://example.com/watch?v=bbb",
    };
    const recB = await seedServiceB.start({ metadata: metaB, option: OPTION });

    // Real service under test: fileExists is true only for A's file, so B is skipped.
    const svc = new DownloadService({
      db,
      runner: runnerA,
      downloadsDir: () => downloadsDir,
      binariesDir: "/test/binaries",
      fileExists: (p) => p === "/dl/a.mp4",
      unlinkFile: () => {},
    });

    const res = await svc.exportPlaylist([recA.id, recB.id], "my list");

    expect(res.included).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.path.endsWith(".m3u")).toBe(true);

    const content = readFileSync(res.path, "utf8");
    expect(content).toContain("/dl/a.mp4");
    expect(content).not.toContain("/dl/b.mp4");

    db.close();
  });

  it("remove() unlinks every download's file, deletes the media row, and cascades transcripts + summaries", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner({
      filePaths: ["/dl/Chan__Vid.mp4", "/dl/Chan__Vid.m4a"],
    });
    const { service, unlinked } = makeService({ db, runner, downloadsDir });

    await service.start({ metadata, option: OPTION });
    await service.start({ metadata, option: OPTION_AUDIO });
    const mediaId = listMedia(db)[0]!.id;

    insertTranscript(db, {
      media_id: mediaId,
      provider_id: "ytdlp-subs",
      language: "en",
      text: "hi",
      segments_json: null,
      model: null,
    });
    const prompt = createPrompt(db, { name: "P", body: "b {{transcript}}" });
    insertSummary(db, {
      media_id: mediaId,
      prompt_id: prompt.id,
      provider_id: "anthropic",
      model: "x",
      text: "s",
    });

    await service.remove(mediaId);

    expect(unlinked.sort()).toEqual(
      ["/dl/Chan__Vid.m4a", "/dl/Chan__Vid.mp4"].sort(),
    );
    expect(getMediaById(db, mediaId)).toBeUndefined();
    expect(listDownloadsByMediaId(db, mediaId)).toHaveLength(0);
    expect(getTranscriptsByMediaId(db, mediaId)).toHaveLength(0);
    expect(getSummariesByMediaId(db, mediaId)).toHaveLength(0);

    db.close();
  });

  it("removeDownload() unlinks the file and deletes only that download row", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner({
      filePaths: ["/dl/Chan__Vid.mp4", "/dl/Chan__Vid.m4a"],
    });
    const { service, unlinked } = makeService({ db, runner, downloadsDir });

    await service.start({ metadata, option: OPTION });
    await service.start({ metadata, option: OPTION_AUDIO });
    const mediaId = listMedia(db)[0]!.id;
    const dlRows = listDownloadsByMediaId(db, mediaId);
    const videoDl = dlRows.find((d) => d.format_id === OPTION.id)!;

    await service.removeDownload(videoDl.id);

    expect(unlinked).toEqual(["/dl/Chan__Vid.mp4"]);
    const remaining = listDownloadsByMediaId(db, mediaId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.format_id).toBe(OPTION_AUDIO.id);
    // media row itself untouched
    expect(getMediaById(db, mediaId)).toBeDefined();

    db.close();
  });

  it("removeTranscript() deletes only the transcript row", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner();
    const { service } = makeService({ db, runner, downloadsDir });

    const m = insertMedia(db, {
      source_url: metadata.sourceUrl,
      platform_id: metadata.platform.id,
      external_id: metadata.externalId,
      title: metadata.title,
      uploader: metadata.uploader,
      uploader_url: metadata.uploaderUrl,
      duration_s: metadata.durationSec,
      thumbnail_path: metadata.thumbnailUrl,
      view_count: metadata.viewCount,
      like_count: metadata.likeCount,
      published_at: null,
      metadata_json: null,
      download_status: "none",
    });
    const t = insertTranscript(db, {
      media_id: m.id,
      provider_id: "ytdlp-subs",
      language: "en",
      text: "hi",
      segments_json: null,
      model: null,
    });

    await service.removeTranscript(t.id);

    expect(getTranscriptsByMediaId(db, m.id)).toHaveLength(0);
    expect(getMediaById(db, m.id)).toBeDefined();

    db.close();
  });

  it("threads a cookies file into runner.download", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner, calls } = makeFakeRunner();
    const youtubeMetadata: MediaMetadata = {
      ...metadata,
      sourceUrl: "https://www.youtube.com/watch?v=abc123",
    };
    const service = new DownloadService({
      db,
      runner,
      downloadsDir: () => downloadsDir,
      binariesDir: "/test/binaries",
      fileExists: () => true,
      unlinkFile: () => {},
      getCookiesFile: async () => "/c/youtube.txt",
    });

    await service.start({ metadata: youtubeMetadata, option: OPTION });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.cookiesFile).toBe("/c/youtube.txt");

    db.close();
  });

  it("removeSummary() deletes only the summary row", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner();
    const { service } = makeService({ db, runner, downloadsDir });

    const m = insertMedia(db, {
      source_url: metadata.sourceUrl,
      platform_id: metadata.platform.id,
      external_id: metadata.externalId,
      title: metadata.title,
      uploader: metadata.uploader,
      uploader_url: metadata.uploaderUrl,
      duration_s: metadata.durationSec,
      thumbnail_path: metadata.thumbnailUrl,
      view_count: metadata.viewCount,
      like_count: metadata.likeCount,
      published_at: null,
      metadata_json: null,
      download_status: "none",
    });
    const prompt = createPrompt(db, { name: "P", body: "b {{transcript}}" });
    const s = insertSummary(db, {
      media_id: m.id,
      prompt_id: prompt.id,
      provider_id: "anthropic",
      model: "x",
      text: "sum",
    });

    await service.removeSummary(s.id);

    expect(getSummariesByMediaId(db, m.id)).toHaveLength(0);
    expect(getMediaById(db, m.id)).toBeDefined();

    db.close();
  });

  it("remove() deletes the rows but never unlinks an imported local file", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner({ filePaths: ["/dl/Chan__Vid.mp4"] });
    const { service, unlinked } = makeService({ db, runner, downloadsDir });

    // A normal download (its file IS ours to delete) …
    await service.start({ metadata, option: OPTION });
    const mediaId = listMedia(db)[0]!.id;
    // … plus an imported local file on the same media row (referenced in place, NOT ours).
    insertDownload(db, {
      media_id: mediaId,
      format_id: LOCAL_FORMAT_ID,
      label: "Local file",
      ext: "mp4",
      height: null,
      file_path: "D:\\my-videos\\precious.mp4",
      file_size: 123,
      status: "done",
      error: null,
    });

    await service.remove(mediaId);

    expect(unlinked).toEqual(["/dl/Chan__Vid.mp4"]);
    expect(unlinked).not.toContain("D:\\my-videos\\precious.mp4");
    expect(getMediaById(db, mediaId)).toBeUndefined();
    expect(listDownloadsByMediaId(db, mediaId)).toHaveLength(0);

    db.close();
  });

  it("removeDownload() deletes an imported row without unlinking the user's file", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner();
    const { service, unlinked } = makeService({ db, runner, downloadsDir });

    const media = insertMedia(db, {
      source_url: "file:///D:/my-videos/precious.mp4",
      platform_id: "local",
      external_id: null,
      title: "precious",
      uploader: null,
      uploader_url: null,
      duration_s: null,
      thumbnail_path: null,
      view_count: null,
      like_count: null,
      published_at: null,
      metadata_json: "{}",
      channel_id: null,
      download_status: "none",
    });
    const row = insertDownload(db, {
      media_id: media.id,
      format_id: LOCAL_FORMAT_ID,
      label: "Local file",
      ext: "mp4",
      height: null,
      file_path: "D:\\my-videos\\precious.mp4",
      file_size: 123,
      status: "done",
      error: null,
    });

    await service.removeDownload(row.id);

    expect(unlinked).toEqual([]);
    expect(listDownloadsByMediaId(db, media.id)).toHaveLength(0);

    db.close();
  });

  it("importLocal() creates a media row plus a done 'local' download row pointing at the file in place", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const mediaPath = join(dir, "Team Standup.mp4");
    writeFileSync(mediaPath, "fake");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner();
    const { service } = makeService({ db, runner, downloadsDir });

    const record = await service.importLocal({
      path: mediaPath,
      durationSec: 61.5,
    });

    expect(record.title).toBe("Team Standup");
    expect(record.platformId).toBe("local");
    expect(record.durationSec).toBe(61.5);
    expect(record.downloadStatus).toBe("done");
    // The file stays where the user put it — no copy into the downloads dir.
    expect(record.downloadPath).toBe(mediaPath);

    const downloads = listDownloadsByMediaId(db, record.id);
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.format_id).toBe(LOCAL_FORMAT_ID);
    // Formats column shows a format, not "Local file": the probed height when the renderer
    // could read one, else the container.
    expect(downloads[0]!.label).toBe("MP4");
    expect(downloads[0]!.ext).toBe("mp4");
    expect(downloads[0]!.status).toBe("done");
    expect(downloads[0]!.file_size).toBe(4);
    expect(existsSync(mediaPath)).toBe(true);

    db.close();
  });

  it("importLocal() labels the download row by video height when the renderer probed one", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const videoPath = join(dir, "Lecture.mkv");
    const audioPath = join(dir, "Podcast.mp3");
    writeFileSync(videoPath, "fake");
    writeFileSync(audioPath, "fake");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner();
    const { service } = makeService({ db, runner, downloadsDir });

    const video = await service.importLocal({ path: videoPath, height: 1080 });
    expect(listDownloadsByMediaId(db, video.id)[0]!.label).toBe("1080p");
    expect(listDownloadsByMediaId(db, video.id)[0]!.height).toBe(1080);

    // Audio reports videoHeight 0 — fall back to the container rather than "0p".
    const audio = await service.importLocal({ path: audioPath, height: 0 });
    expect(listDownloadsByMediaId(db, audio.id)[0]!.label).toBe("MP3");
    expect(listDownloadsByMediaId(db, audio.id)[0]!.height).toBeNull();

    // The delete guard's discriminator must not move with the label.
    expect(listDownloadsByMediaId(db, video.id)[0]!.format_id).toBe(
      LOCAL_FORMAT_ID,
    );

    db.close();
  });

  it("importLocal() re-importing the same file attaches to the existing media row", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const mediaPath = join(dir, "Talk.mp4");
    writeFileSync(mediaPath, "fake");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner();
    const { service } = makeService({ db, runner, downloadsDir });

    const first = await service.importLocal({ path: mediaPath });
    const second = await service.importLocal({ path: mediaPath });

    expect(second.id).toBe(first.id);
    expect(listMedia(db)).toHaveLength(1);
    expect(listDownloadsByMediaId(db, first.id)).toHaveLength(1);

    db.close();
  });

  it("importLocal() applies tags and rejects when the file is gone", async () => {
    dir = mkdtempSync(join(tmpdir(), "sift-dlsvc-"));
    const downloadsDir = join(dir, "downloads");
    const mediaPath = join(dir, "Tagged.mp4");
    writeFileSync(mediaPath, "fake");
    const db = await openTestDatabase();
    runMigrations(db);
    const { runner } = makeFakeRunner();
    // Real existsSync here — makeService's stub returns true for everything, which would
    // make the missing-file assertion below pass for the wrong reason.
    const service = new DownloadService({
      db,
      runner,
      downloadsDir: () => downloadsDir,
      binariesDir: "/test/binaries",
    });

    // LOCAL_TAG is applied by the service, so both entry points (drop + picker) get it.
    const record = await service.importLocal({
      path: mediaPath,
      tags: ["talks"],
    });
    expect(tagsForMedia(db, record.id)).toEqual([LOCAL_TAG, "talks"]);

    await expect(
      service.importLocal({ path: join(dir, "nope.mp4") }),
    ).rejects.toThrow(/no longer exists/);

    db.close();
  });
});
