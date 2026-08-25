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
  favourite: number; // 0 | 1
  pinned_at: number | null;
  created_at: number;
  updated_at: number;
}

// channel_id is optional on insert (defaults to null) — it was added late and is backfilled
// from metadata_json for older rows, so callers that predate it need not supply it.
export type NewMedia = Omit<
  MediaRow,
  | "id"
  | "channel_id"
  | "download_path"
  | "favourite"
  | "pinned_at"
  | "created_at"
  | "updated_at"
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
  publishedFrom?: number | null; // published_at >= (inclusive ms epoch)
  publishedTo?: number | null; // published_at <= (inclusive ms epoch)
  durationMin?: number | null; // duration_s >= (inclusive seconds)
  durationMax?: number | null; // duration_s <= (inclusive seconds)
  favourite?: boolean | null; // true → only favourites
  collectionId?: number | null; // only rows in this collection
  /** Smart filter: rows still lacking one of the three artifacts. */
  missing?: "transcript" | "summary" | "download" | null;
  /** Exact `media.download_status`, e.g. "error" for the failed-download filter. */
  downloadStatus?: string | null;
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
  if (f.publishedFrom != null) {
    clauses.push(
      "m.published_at IS NOT NULL AND m.published_at >= @publishedFrom",
    );
    params.publishedFrom = f.publishedFrom;
  }
  if (f.publishedTo != null) {
    clauses.push(
      "m.published_at IS NOT NULL AND m.published_at <= @publishedTo",
    );
    params.publishedTo = f.publishedTo;
  }
  // A row with an unknown duration is excluded from a duration filter rather than treated as
  // zero — "under 5 minutes" should not surface everything Sift failed to probe.
  if (f.durationMin != null) {
    clauses.push("m.duration_s IS NOT NULL AND m.duration_s >= @durationMin");
    params.durationMin = f.durationMin;
  }
  if (f.durationMax != null) {
    clauses.push("m.duration_s IS NOT NULL AND m.duration_s <= @durationMax");
    params.durationMax = f.durationMax;
  }
  if (f.favourite) clauses.push("m.favourite = 1");
  if (f.collectionId != null) {
    clauses.push(
      "EXISTS (SELECT 1 FROM media_collection mc WHERE mc.media_id = m.id AND mc.collection_id = @collectionId)",
    );
    params.collectionId = f.collectionId;
  }
  if (f.missing === "transcript")
    clauses.push(
      "NOT EXISTS (SELECT 1 FROM transcript t WHERE t.media_id = m.id)",
    );
  if (f.missing === "summary")
    clauses.push(
      "NOT EXISTS (SELECT 1 FROM summary s WHERE s.media_id = m.id)",
    );
  if (f.missing === "download")
    clauses.push("(m.download_path IS NULL OR m.download_status <> 'done')");
  if (f.downloadStatus) {
    clauses.push("m.download_status = @downloadStatus");
    params.downloadStatus = f.downloadStatus;
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

/** Pinned rows first (oldest pin first, so pinning is stable), then newest. Shared by the
 * page query and the id query so "export everything matching" is in the order on screen. */
const LIBRARY_ORDER =
  "ORDER BY CASE WHEN m.pinned_at IS NULL THEN 1 ELSE 0 END, m.pinned_at ASC, m.created_at DESC, m.id DESC";

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
      `SELECT m.* FROM media m ${where} ${LIBRARY_ORDER} LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit, offset });
  return { rows, total };
}

/** All media ids matching `filter`, newest first (e.g. to export the whole filtered set, not one page). */
export function listMediaIds(db: SiftDatabase, filter: MediaFilter): number[] {
  const { where, params } = mediaWhere(filter);
  const stmt = db.prepare<{ id: number }>(
    `SELECT m.id FROM media m ${where} ${LIBRARY_ORDER}`,
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

/** One group of media rows that look like the same video. */
export interface DuplicateGroup {
  /** What matched: the same platform + external id, or the same title and duration. */
  reason: "same-source" | "same-title-duration";
  key: string;
  ids: number[];
}

/**
 * Finds probable duplicates, newest group first.
 *
 * Two passes rather than one clever query, because the two kinds of duplicate are different
 * facts. `same-source` is certain: the same platform and external id is the same video, and
 * that happens when a URL is re-fetched through a different form (youtu.be vs watch?v=).
 * `same-title-duration` is a guess for re-uploads and for local files imported twice under
 * different names, so it needs an exact duration match to stay useful; a group already
 * reported as same-source is not repeated.
 */
export function findDuplicates(db: SiftDatabase): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const seen = new Set<number>();

  const bySource = db
    .prepare<{ key: string; ids: string }>(
      `SELECT platform_id || ':' || external_id AS key, group_concat(id) AS ids
         FROM media
        WHERE external_id IS NOT NULL AND external_id <> ''
        GROUP BY platform_id, external_id
       HAVING COUNT(*) > 1
        ORDER BY MAX(created_at) DESC`,
    )
    .all();
  for (const row of bySource) {
    const ids = row.ids.split(",").map(Number);
    ids.forEach((id) => seen.add(id));
    groups.push({ reason: "same-source", key: row.key, ids });
  }

  const byTitle = db
    .prepare<{ key: string; ids: string }>(
      `SELECT title || ' (' || duration_s || 's)' AS key, group_concat(id) AS ids
         FROM media
        WHERE duration_s IS NOT NULL AND title <> ''
        GROUP BY title COLLATE NOCASE, duration_s
       HAVING COUNT(*) > 1
        ORDER BY MAX(created_at) DESC`,
    )
    .all();
  for (const row of byTitle) {
    const ids = row.ids.split(",").map(Number);
    // Skip a group whose members are all already reported as the same source.
    if (ids.every((id) => seen.has(id))) continue;
    ids.forEach((id) => seen.add(id));
    groups.push({ reason: "same-title-duration", key: row.key, ids });
  }
  return groups;
}
