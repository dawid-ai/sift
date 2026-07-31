import type { SiftDatabase } from "./database";

export type DownloadStatus = "none" | "downloading" | "done" | "error";

export interface MediaRow {
  id: number;
  source_url: string;
  platform_id: string;
  external_id: string | null;
  title: string;
  uploader: string | null;
  uploader_url: string | null;
  duration_s: number | null;
  thumbnail_path: string | null; // Phase 3: holds the REMOTE thumbnail URL; a later phase overwrites with a cached local path.
  view_count: number | null;
  like_count: number | null;
  published_at: number | null;
  metadata_json: string | null;
  channel_id: string | null; // source channel (YouTube UC…) for "downloaded from this channel"
  download_path: string | null;
  download_status: string;
  created_at: number;
  updated_at: number;
}

// channel_id is optional on insert (defaults to null) — it was added late and is backfilled
// from metadata_json for older rows, so callers that predate it need not supply it.
export type NewMedia = Omit<
  MediaRow,
  "id" | "channel_id" | "download_path" | "created_at" | "updated_at"
> & { channel_id?: string | null };

export function insertMedia(db: SiftDatabase, m: NewMedia): MediaRow {
  const now = Date.now();
  const result = db
    .prepare(
      `INSERT INTO media (
         source_url, platform_id, external_id, title, uploader, uploader_url,
         duration_s, thumbnail_path, view_count, like_count, published_at,
         metadata_json, channel_id, download_path, download_status, created_at, updated_at
       ) VALUES (
         @source_url, @platform_id, @external_id, @title, @uploader, @uploader_url,
         @duration_s, @thumbnail_path, @view_count, @like_count, @published_at,
         @metadata_json, @channel_id, @download_path, @download_status, @created_at, @updated_at
       )`,
    )
    .run({
      ...m,
      channel_id: m.channel_id ?? null,
      download_path: null,
      created_at: now,
      updated_at: now,
    });
  return getMediaById(db, Number(result.lastInsertRowid))!;
}

export function setMediaDownload(
  db: SiftDatabase,
  id: number,
  status: string,
  downloadPath: string | null,
): void {
  db.prepare(
    "UPDATE media SET download_status = ?, download_path = ?, updated_at = ? WHERE id = ?",
  ).run(status, downloadPath, Date.now(), id);
}

/** One-time, idempotent hygiene: fill media.channel_id from metadata_json for rows that
 * predate the column, reading `channel_id` out of the stored yt-dlp dump. NOT a schema
 * migration — safe to run on every launch (only touches rows still missing a channel_id). */
export function backfillMediaChannelIds(db: SiftDatabase): void {
  // The LIKE skips rows whose stored dump has no channel_id key at all (e.g. X/Twitter),
  // so they aren't JSON.parsed on every launch — they'd never yield a channel_id anyway.
  const rows = db
    .prepare<{ id: number; metadata_json: string }>(
      `SELECT id, metadata_json FROM media
       WHERE channel_id IS NULL AND metadata_json IS NOT NULL AND metadata_json LIKE '%"channel_id"%'`,
    )
    .all();
  const update = db.prepare("UPDATE media SET channel_id = ? WHERE id = ?");
  for (const row of rows) {
    let cid: string | null = null;
    try {
      const raw = JSON.parse(row.metadata_json) as Record<string, unknown>;
      if (typeof raw.channel_id === "string" && raw.channel_id) cid = raw.channel_id;
    } catch {
      /* malformed json — leave channel_id null */
    }
    if (cid) update.run(cid, row.id);
  }
}

/** Media downloaded/transcribed from a given source channel, newest first. Powers the
 * channel detail's "Downloaded from this channel" list. */
export function listMediaByChannelId(db: SiftDatabase, channelId: string): MediaRow[] {
  return db
    .prepare<MediaRow>(
      "SELECT * FROM media WHERE channel_id = @channelId ORDER BY created_at DESC, id DESC",
    )
    .all({ channelId });
}

export function getMediaById(db: SiftDatabase, id: number): MediaRow | undefined {
  return db.prepare<MediaRow>("SELECT * FROM media WHERE id = ?").get(id);
}

export function deleteMedia(db: SiftDatabase, id: number): void {
  db.prepare("DELETE FROM media WHERE id = ?").run(id);
}

export function listMedia(db: SiftDatabase): MediaRow[] {
  return db.prepare<MediaRow>("SELECT * FROM media ORDER BY created_at DESC, id DESC").all();
}

export function getMediaBySourceUrl(db: SiftDatabase, sourceUrl: string): MediaRow | undefined {
  return db
    .prepare<MediaRow>("SELECT * FROM media WHERE source_url = @sourceUrl ORDER BY id DESC LIMIT 1")
    .get({ sourceUrl });
}
