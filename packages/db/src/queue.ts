import type { SiftDatabase } from "./database";

export interface QueueItemRow {
  id: number;
  source_url: string;
  spec_json: string;
  status: string;
  ops_json: string | null;
  media_id: number | null;
  queue_order: number;
  error: string | null;
  created_at: number;
}

export type NewQueueItem = Omit<QueueItemRow, "id" | "created_at">;

export function insertQueueItem(
  db: SiftDatabase,
  item: NewQueueItem,
): QueueItemRow {
  const now = Date.now();
  const result = db
    .prepare(
      `INSERT INTO queue_item (source_url, spec_json, status, ops_json, media_id, queue_order, error, created_at)
       VALUES (@source_url, @spec_json, @status, @ops_json, @media_id, @queue_order, @error, @created_at)`,
    )
    .run({ ...item, created_at: now });
  return getQueueItem(db, Number(result.lastInsertRowid))!;
}

export function getQueueItem(
  db: SiftDatabase,
  id: number,
): QueueItemRow | undefined {
  return db
    .prepare<QueueItemRow>("SELECT * FROM queue_item WHERE id = @id")
    .get({ id });
}

export function listQueueItems(db: SiftDatabase): QueueItemRow[] {
  return db
    .prepare<QueueItemRow>(
      "SELECT * FROM queue_item ORDER BY queue_order ASC, id ASC",
    )
    .all();
}

/** A queue row plus the title of the media it resolved to (null while unresolved). */
export type QueueItemWithMedia = QueueItemRow & { media_title: string | null };

/**
 * Same ordering as `listQueueItems`, with the resolved media title joined on.
 *
 * A LEFT JOIN rather than a per-row lookup: the list is re-emitted to every window on every
 * progress tick, so N+1 point reads on a 200-item queue would be paid dozens of times a
 * second. `listQueueItems` stays as-is for the callers that only mutate rows.
 */
export function listQueueItemsWithMedia(
  db: SiftDatabase,
): QueueItemWithMedia[] {
  return db
    .prepare<QueueItemWithMedia>(
      `SELECT q.*, m.title AS media_title
         FROM queue_item q LEFT JOIN media m ON m.id = q.media_id
        ORDER BY q.queue_order ASC, q.id ASC`,
    )
    .all();
}

type PatchCol = "status" | "ops_json" | "media_id" | "error" | "queue_order";

export function updateQueueItem(
  db: SiftDatabase,
  id: number,
  patch: Partial<Pick<QueueItemRow, PatchCol>>,
): void {
  const row = getQueueItem(db, id);
  if (!row) return;
  // Explicit-`in` merge so an intentional `null` (e.g. clearing `error` on retry)
  // isn't lost the way `patch.error ?? row.error` would lose it.
  const merged = {
    id,
    status: "status" in patch ? patch.status : row.status,
    ops_json: "ops_json" in patch ? patch.ops_json : row.ops_json,
    media_id: "media_id" in patch ? patch.media_id : row.media_id,
    error: "error" in patch ? patch.error : row.error,
    queue_order: "queue_order" in patch ? patch.queue_order : row.queue_order,
  };
  db.prepare(
    `UPDATE queue_item SET status = @status, ops_json = @ops_json, media_id = @media_id,
       error = @error, queue_order = @queue_order WHERE id = @id`,
  ).run(merged);
}

export function deleteQueueItem(db: SiftDatabase, id: number): void {
  db.prepare("DELETE FROM queue_item WHERE id = ?").run(id);
}

export function setQueueOrder(
  db: SiftDatabase,
  id: number,
  order: number,
): void {
  db.prepare("UPDATE queue_item SET queue_order = ? WHERE id = ?").run(
    order,
    id,
  );
}

export function maxQueueOrder(db: SiftDatabase): number {
  const r = db
    .prepare<{ m: number | null }>(
      "SELECT MAX(queue_order) AS m FROM queue_item",
    )
    .get();
  return r?.m ?? 0;
}

export function resetRunningToQueued(db: SiftDatabase): number {
  const res = db
    .prepare("UPDATE queue_item SET status = 'queued' WHERE status = 'running'")
    .run();
  return res.changes;
}
