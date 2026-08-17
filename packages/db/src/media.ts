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
      if (typeof raw.channel_id === "string" && raw.channel_id)
        cid = raw.channel_id;
    } catch {
      /* malformed json — leave channel_id null */
    }
    if (cid) update.run(cid, row.id);
  }
}

/** Media downloaded/transcribed from a given source channel, newest first. Powers the
 * channel detail's "Downloaded from this channel" list. */
export function listMediaByChannelId(
  db: SiftDatabase,
  channelId: string,
): MediaRow[] {
  return db
    .prepare<MediaRow>(
      "SELECT * FROM media WHERE channel_id = @channelId ORDER BY created_at DESC, id DESC",
    )
    .all({ channelId });
}

export function getMediaById(
  db: SiftDatabase,
  id: number,
): MediaRow | undefined {
  return db.prepare<MediaRow>("SELECT * FROM media WHERE id = ?").get(id);
}

export function deleteMedia(db: SiftDatabase, id: number): void {
  db.prepare("DELETE FROM media WHERE id = ?").run(id);
}

export function listMedia(db: SiftDatabase): MediaRow[] {
  return db
    .prepare<MediaRow>("SELECT * FROM media ORDER BY created_at DESC, id DESC")
    .all();
}

/** Filters for the paged library list. All optional; omitted/null fields don't constrain.
 * `ids: []` matches nothing (an empty search result); `ids: [n,…]` restricts to those rows. */
export interface MediaFilter {
  tags?: string[] | null; // rows carrying ALL of these media_tag names, case-insensitive
  channel?: string | null; // exact uploader
  platform?: string | null; // exact platform_id
  from?: number | null; // created_at >= (inclusive ms epoch)
  to?: number | null; // created_at <= (inclusive ms epoch)
  ids?: number[] | null; // restrict to these media ids (e.g. search results)
  excludeTags?: string[] | null; // hide rows carrying any of these tags, case-insensitive
}

/** Builds a WHERE clause + named params from a MediaFilter. Empty string when nothing is set. */
function mediaWhere(f: MediaFilter): {
  where: string;
  params: Record<string, unknown>;
} {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  // Multi-tag is AND (narrowing): one EXISTS per tag, so a row must carry every one.
  f.tags?.forEach((t, i) => {
    clauses.push(
      `EXISTS (SELECT 1 FROM media_tag mt WHERE mt.media_id = m.id AND mt.name = @tag${i} COLLATE NOCASE)`,
    );
    params[`tag${i}`] = t;
  });
  if (f.excludeTags?.length) {
    const ph = f.excludeTags
      .map((t, i) => {
        params[`ntag${i}`] = t;
        return `@ntag${i}`;
      })
      .join(",");
    clauses.push(
      `NOT EXISTS (SELECT 1 FROM media_tag mt WHERE mt.media_id = m.id AND mt.name COLLATE NOCASE IN (${ph}))`,
    );
  }
  if (f.channel) {
    clauses.push("m.uploader = @channel");
    params.channel = f.channel;
  }
  if (f.platform) {
    clauses.push("m.platform_id = @platform");
    params.platform = f.platform;
  }
  if (f.from != null) {
    clauses.push("m.created_at >= @from");
    params.from = f.from;
  }
  if (f.to != null) {
    clauses.push("m.created_at <= @to");
    params.to = f.to;
  }
  if (f.ids != null) {
    if (f.ids.length === 0) {
      clauses.push("0"); // empty allowlist → match nothing
    } else {
      const ph = f.ids
        .map((id, i) => {
          params[`mid${i}`] = id;
          return `@mid${i}`;
        })
        .join(",");
      clauses.push(`m.id IN (${ph})`);
    }
  }
  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

/** One page of media matching `filter`, newest first, plus the total match count (for the pager). */
export function listMediaPage(
  db: SiftDatabase,
  filter: MediaFilter,
  limit: number,
  offset: number,
): { rows: MediaRow[]; total: number } {
  const { where, params } = mediaWhere(filter);
  const countStmt = db.prepare<{ n: number }>(
    `SELECT COUNT(*) AS n FROM media m ${where}`,
  );
  const total = (where ? countStmt.get(params) : countStmt.get())!.n;
  const rows = db
    .prepare<MediaRow>(
      `SELECT m.* FROM media m ${where} ORDER BY m.created_at DESC, m.id DESC LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit, offset });
  return { rows, total };
}

/** All media ids matching `filter`, newest first (e.g. to export the whole filtered set, not one page). */
export function listMediaIds(db: SiftDatabase, filter: MediaFilter): number[] {
  const { where, params } = mediaWhere(filter);
  const stmt = db.prepare<{ id: number }>(
    `SELECT m.id FROM media m ${where} ORDER BY m.created_at DESC, m.id DESC`,
  );
  return (where ? stmt.all(params) : stmt.all()).map((r) => r.id);
}

/** Distinct uploaders present in the library, alphabetical — powers the channel filter dropdown. */
export function listMediaChannels(db: SiftDatabase): string[] {
  return db
    .prepare<{ uploader: string }>(
      "SELECT DISTINCT uploader FROM media WHERE uploader IS NOT NULL AND uploader <> '' ORDER BY uploader COLLATE NOCASE",
    )
    .all()
    .map((r) => r.uploader);
}

/** Distinct platform ids present in the library, alphabetical — powers the platform filter dropdown. */
export function listMediaPlatforms(db: SiftDatabase): string[] {
  return db
    .prepare<{ platform_id: string }>(
      "SELECT DISTINCT platform_id FROM media WHERE platform_id IS NOT NULL AND platform_id <> '' ORDER BY platform_id",
    )
    .all()
    .map((r) => r.platform_id);
}

/** Points a media row at a locally-stored poster/thumbnail image. */
export function setMediaThumbnail(
  db: SiftDatabase,
  id: number,
  path: string | null,
): void {
  db.prepare(
    "UPDATE media SET thumbnail_path = ?, updated_at = ? WHERE id = ?",
  ).run(path, Date.now(), id);
}

/** Whether any media row references this exact thumbnail path — the allowlist gate for the
 * sift-poster:// protocol handler, mirroring `downloadExistsByFilePath` for sift-media://. */
export function mediaExistsByThumbnailPath(
  db: SiftDatabase,
  path: string,
): boolean {
  return (
    db
      .prepare<{ id: number }>(
        "SELECT id FROM media WHERE thumbnail_path = @path LIMIT 1",
      )
      .get({ path }) !== undefined
  );
}

export function getMediaBySourceUrl(
  db: SiftDatabase,
  sourceUrl: string,
): MediaRow | undefined {
  return db
    .prepare<MediaRow>(
      "SELECT * FROM media WHERE source_url = @sourceUrl ORDER BY id DESC LIMIT 1",
    )
    .get({ sourceUrl });
}
