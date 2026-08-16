import type { SiftDatabase } from "./database";

/** Adds a tag to a media row. Trims; no-op on empty; idempotent (case-insensitive). */
export function addTag(db: SiftDatabase, mediaId: number, name: string): void {
  const n = name.trim();
  if (!n) return;
  db.prepare(
    "INSERT OR IGNORE INTO media_tag (media_id, name) VALUES (@mediaId, @name)",
  ).run({ mediaId, name: n });
}

/**
 * One-time, idempotent hygiene: attaches `tag` to every media row on `platformId`. NOT a
 * schema migration — safe to run on every launch (INSERT OR IGNORE, and it only ever adds).
 * Exists so local files imported before auto-tagging shipped still appear under the filter.
 * Constants come from the caller: `@sift/db` deliberately doesn't depend on `@sift/core`.
 */
export function backfillPlatformTag(db: SiftDatabase, platformId: string, tag: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO media_tag (media_id, name)
     SELECT id, @tag FROM media WHERE platform_id = @platformId`,
  ).run({ tag, platformId });
}

/** Removes a tag from a media row (case-insensitive via column collation). */
export function removeTag(db: SiftDatabase, mediaId: number, name: string): void {
  db.prepare(
    "DELETE FROM media_tag WHERE media_id = @mediaId AND name = @name",
  ).run({ mediaId, name: name.trim() });
}

/** Names attached to one media, alphabetical. */
export function tagsForMedia(db: SiftDatabase, mediaId: number): string[] {
  return db
    .prepare<{ name: string }>(
      "SELECT name FROM media_tag WHERE media_id = @mediaId ORDER BY name COLLATE NOCASE",
    )
    .all({ mediaId })
    .map((r) => r.name);
}

/** Batch lookup for the Library list. Ids with no tags are absent from the map. */
export function tagsForMediaIds(
  db: SiftDatabase,
  ids: number[],
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (ids.length === 0) return map;
  // Named params (the repo's convention) — works on both better-sqlite3 and the
  // sql.js test driver. Build @id0,@id1,… placeholders + a matching params object.
  const params: Record<string, number> = {};
  const placeholders = ids
    .map((id, i) => {
      params[`id${i}`] = id;
      return `@id${i}`;
    })
    .join(",");
  const rows = db
    .prepare<{ media_id: number; name: string }>(
      `SELECT media_id, name FROM media_tag
       WHERE media_id IN (${placeholders})
       ORDER BY name COLLATE NOCASE`,
    )
    .all(params);
  for (const r of rows) {
    const list = map.get(r.media_id) ?? [];
    list.push(r.name);
    map.set(r.media_id, list);
  }
  return map;
}

/** All distinct tags with their video counts, alphabetical. */
export function listAllTags(
  db: SiftDatabase,
): { name: string; count: number }[] {
  return db
    .prepare<{ name: string; count: number }>(
      `SELECT name, COUNT(*) AS count FROM media_tag
       GROUP BY name COLLATE NOCASE
       ORDER BY name COLLATE NOCASE`,
    )
    .all();
}
