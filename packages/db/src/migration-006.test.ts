import { beforeEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import type { SiftDatabase } from "./database";
import { migration001 } from "./migrations/001-asset.sql";
import { migration002 } from "./migrations/002-media.sql";
import { migration003 } from "./migrations/003-transcript.sql";
import { migration004Prompt } from "./migrations/004-prompt.sql";
import { migration005Summary } from "./migrations/005-summary.sql";
import { migration006 } from "./migrations/006-download.sql";

function applyPre6(db: SiftDatabase) {
  for (const sql of [
    migration001,
    migration002,
    migration003,
    migration004Prompt,
    migration005Summary,
  ]) {
    db.exec(sql);
  }
}

describe("migration 006", () => {
  let db: SiftDatabase;
  beforeEach(async () => {
    db = await openTestDatabase();
    applyPre6(db);
  });

  it("merges duplicate media by url and moves inline downloads into download rows", () => {
    const now = Date.now();
    const insMedia = (url: string, status: string, path: string | null) =>
      Number(
        db
          .prepare(
            `INSERT INTO media (source_url, platform_id, title, download_status, download_path, created_at, updated_at)
             VALUES (@u, 'youtube', 'T', @s, @p, @c, @c)`,
          )
          .run({ u: url, s: status, p: path, c: now }).lastInsertRowid,
      );

    // Same URL twice: a transcript-only "none" row (earlier id = keeper) + a downloaded row.
    const keeper = insMedia("https://x/1", "none", null);
    const dupDownloaded = insMedia("https://x/1", "done", "/dl/one.mp4");
    // A standalone downloaded video, and a stale downloading row (no file).
    insMedia("https://x/2", "done", "/dl/two.mp4");
    insMedia("https://x/3", "downloading", null);
    // An errored row with a stale (non-null) download_path — file_path must be dropped.
    insMedia("https://x/4", "error", "/dl/stale.mp4");

    // Give the keeper a transcript and the dup a summary — both must survive on the keeper.
    db.prepare(
      `INSERT INTO transcript (media_id, provider_id, text, created_at) VALUES (@m,'p','hi',@c)`,
    ).run({ m: keeper, c: now });
    db.prepare(
      `INSERT INTO summary (media_id, provider_id, model, text, created_at) VALUES (@m,'p','x','s',@c)`,
    ).run({ m: dupDownloaded, c: now });

    db.exec(migration006);

    // One media per url now (4 urls → 4 media rows).
    const media = db
      .prepare<{ id: number; source_url: string }>(
        "SELECT id, source_url FROM media",
      )
      .all();
    expect(media).toHaveLength(4);

    // The x/1 keeper owns the transcript, the summary, and one 'done' download.
    const tx = db
      .prepare<{ c: number }>(
        "SELECT COUNT(*) c FROM transcript WHERE media_id = @m",
      )
      .get({ m: keeper })!;
    const sm = db
      .prepare<{ c: number }>(
        "SELECT COUNT(*) c FROM summary WHERE media_id = @m",
      )
      .get({ m: keeper })!;
    const dl = db
      .prepare<{ status: string; file_path: string | null }>(
        "SELECT status, file_path FROM download WHERE media_id = @m",
      )
      .all({ m: keeper });
    expect(tx.c).toBe(1);
    expect(sm.c).toBe(1);
    expect(dl).toEqual([{ status: "done", file_path: "/dl/one.mp4" }]);

    // The stale 'downloading' row (x/3) produced no download row.
    const x3 = db
      .prepare<{ id: number }>(
        "SELECT id FROM media WHERE source_url = 'https://x/3'",
      )
      .get()!;
    const x3dl = db
      .prepare<{ c: number }>(
        "SELECT COUNT(*) c FROM download WHERE media_id = @m",
      )
      .get({ m: x3.id })!;
    expect(x3dl.c).toBe(0);

    // The 'error' row (x/4) produced a download row with status='error' and file_path
    // gated to NULL, even though the source media had a stale non-null download_path.
    const x4 = db
      .prepare<{ id: number }>(
        "SELECT id FROM media WHERE source_url = 'https://x/4'",
      )
      .get()!;
    const x4dl = db
      .prepare<{ status: string; file_path: string | null }>(
        "SELECT status, file_path FROM download WHERE media_id = @m",
      )
      .all({ m: x4.id });
    expect(x4dl).toEqual([{ status: "error", file_path: null }]);

    // The standalone x/2 download row survives the merge UPDATEs unchanged, still
    // pointing at its own (non-duplicated) media id.
    const x2 = db
      .prepare<{ id: number }>(
        "SELECT id FROM media WHERE source_url = 'https://x/2'",
      )
      .get()!;
    const x2dl = db
      .prepare<{ status: string; file_path: string | null; media_id: number }>(
        "SELECT status, file_path, media_id FROM download WHERE media_id = @m",
      )
      .all({ m: x2.id });
    expect(x2dl).toEqual([
      { status: "done", file_path: "/dl/two.mp4", media_id: x2.id },
    ]);
  });
});
