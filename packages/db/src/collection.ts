import type { SiftDatabase } from "./database";

export interface CollectionRow {
  id: number;
  name: string;
  created_at: number;
}

/** A collection plus how many videos are in it — what the Library sidebar lists. */
export interface CollectionCount extends CollectionRow {
  count: number;
}

/** Creates a collection, or returns the existing one with that name (case-insensitive). */
export function createCollection(
  db: SiftDatabase,
  name: string,
): CollectionRow {
  const n = name.trim();
  if (!n) throw new Error("A collection needs a name.");
  const existing = db
    .prepare<CollectionRow>("SELECT * FROM collection WHERE name = ?")
    .get(n);
  if (existing) return existing;
  const result = db
    .prepare(
      "INSERT INTO collection (name, created_at) VALUES (@name, @createdAt)",
    )
    .run({ name: n, createdAt: Date.now() });
  return db
    .prepare<CollectionRow>("SELECT * FROM collection WHERE id = ?")
    .get(Number(result.lastInsertRowid))!;
}

export function renameCollection(
  db: SiftDatabase,
  id: number,
  name: string,
): void {
  const n = name.trim();
  if (!n) throw new Error("A collection needs a name.");
  db.prepare("UPDATE collection SET name = @name WHERE id = @id").run({
    id,
    name: n,
  });
}

/** Deletes the collection. Membership cascades; the videos themselves are untouched. */
export function deleteCollection(db: SiftDatabase, id: number): void {
  db.prepare("DELETE FROM collection WHERE id = ?").run(id);
}

export function listCollections(db: SiftDatabase): CollectionCount[] {
  return db
    .prepare<CollectionCount>(
      `SELECT c.*, (SELECT COUNT(*) FROM media_collection mc WHERE mc.collection_id = c.id) AS count
         FROM collection c ORDER BY c.name COLLATE NOCASE`,
    )
    .all();
}

/** Appends media to a collection at the end. Idempotent — re-adding keeps the first position. */
export function addToCollection(
  db: SiftDatabase,
  collectionId: number,
  mediaIds: number[],
): number {
  if (mediaIds.length === 0) return 0;
  const next = db
    .prepare<{ n: number }>(
      "SELECT COALESCE(MAX(position), -1) + 1 AS n FROM media_collection WHERE collection_id = ?",
    )
    .get(collectionId)!.n;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO media_collection (collection_id, media_id, position)
     VALUES (@collectionId, @mediaId, @position)`,
  );
  let added = 0;
  let position = next;
  for (const mediaId of mediaIds) {
    // `changes` distinguishes an insert from an ignored duplicate, so the caller can say
    // "added 3, 2 already there" instead of claiming all five landed.
    const result = insert.run({ collectionId, mediaId, position });
    if (Number(result.changes) > 0) {
      added++;
      position++;
    }
  }
  return added;
}

export function removeFromCollection(
  db: SiftDatabase,
  collectionId: number,
  mediaIds: number[],
): void {
  if (mediaIds.length === 0) return;
  const stmt = db.prepare(
    "DELETE FROM media_collection WHERE collection_id = @collectionId AND media_id = @mediaId",
  );
  for (const mediaId of mediaIds) stmt.run({ collectionId, mediaId });
}

/** Collection ids one media belongs to — for the checkbox state in the detail view. */
export function collectionsForMedia(
  db: SiftDatabase,
  mediaId: number,
): number[] {
  return db
    .prepare<{ collection_id: number }>(
      "SELECT collection_id FROM media_collection WHERE media_id = ? ORDER BY collection_id",
    )
    .all(mediaId)
    .map((r) => r.collection_id);
}

/** Marks or unmarks a favourite. */
export function setFavourite(
  db: SiftDatabase,
  mediaId: number,
  favourite: boolean,
): void {
  db.prepare(
    "UPDATE media SET favourite = @value, updated_at = @now WHERE id = @mediaId",
  ).run({ mediaId, value: favourite ? 1 : 0, now: Date.now() });
}

/**
 * Pins or unpins. Pinned rows sort first, oldest pin first, so the order is stable.
 *
 * `pinned_at` is forced strictly greater than every existing pin rather than being set to
 * the clock. Two pins inside the same millisecond — a bulk pin, or a fast pair of clicks —
 * would otherwise tie, and the tie breaks on `created_at DESC`, which silently reverses the
 * order the user pinned them in.
 */
export function setPinned(
  db: SiftDatabase,
  mediaId: number,
  pinned: boolean,
): void {
  let value: number | null = null;
  if (pinned) {
    const max =
      db
        .prepare<{ n: number | null }>(
          "SELECT MAX(pinned_at) AS n FROM media WHERE pinned_at IS NOT NULL",
        )
        .get()?.n ?? null;
    const now = Date.now();
    value = max === null ? now : Math.max(now, max + 1);
  }
  db.prepare(
    "UPDATE media SET pinned_at = @value, updated_at = @now WHERE id = @mediaId",
  ).run({ mediaId, value, now: Date.now() });
}
