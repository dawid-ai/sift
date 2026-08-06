import type { SiftDatabase } from "./database";

export interface FrameRow {
  id: number;
  media_id: number;
  ts_ms: number;
  image_path: string;
  ocr_text: string | null;
  ocr_confidence: number | null;
  phash: string | null;
  kind: string | null;
  included: number; // 1 = feeds document generation, 0 = deselected. DB default 1.
  created_at: number;
}
// `included` is omitted: it has a DB default (1), so inserts never set it — the UI toggles
// it afterward via setFrameIncluded.
export type NewFrame = Omit<FrameRow, "id" | "included" | "created_at">;

export function insertFrame(db: SiftDatabase, f: NewFrame): FrameRow {
  const created_at = Date.now();
  const res = db
    .prepare(
      `INSERT INTO frame (media_id, ts_ms, image_path, ocr_text, ocr_confidence, phash, kind, created_at)
       VALUES (@media_id, @ts_ms, @image_path, @ocr_text, @ocr_confidence, @phash, @kind, @created_at)`,
    )
    .run({ ...f, created_at });
  return db.prepare<FrameRow>("SELECT * FROM frame WHERE id = @id").get({ id: Number(res.lastInsertRowid) })!;
}

/** Frames for a media, ordered along the timeline (oldest timestamp first). */
export function getFramesByMediaId(db: SiftDatabase, mediaId: number): FrameRow[] {
  return db
    .prepare<FrameRow>("SELECT * FROM frame WHERE media_id = @mediaId ORDER BY ts_ms ASC, id ASC")
    .all({ mediaId });
}

export function deleteFramesByMediaId(db: SiftDatabase, mediaId: number): void {
  db.prepare("DELETE FROM frame WHERE media_id = ?").run(mediaId);
}

/** Deletes only auto-extracted frames, preserving manual captures (kind='manual') so a
 * re-extract doesn't wipe the user's hand-grabbed frames. `IS NOT` handles NULL kinds. */
export function deleteAutoFramesByMediaId(db: SiftDatabase, mediaId: number): void {
  db.prepare("DELETE FROM frame WHERE media_id = ? AND kind IS NOT 'manual'").run(mediaId);
}

/** Toggles whether a frame feeds document generation. */
export function setFrameIncluded(db: SiftDatabase, id: number, included: boolean): void {
  db.prepare("UPDATE frame SET included = ? WHERE id = ?").run(included ? 1 : 0, id);
}

/** Allowlist check for the sift-frame:// protocol — only serve paths we actually stored. */
export function frameExistsByImagePath(db: SiftDatabase, imagePath: string): boolean {
  return db.prepare("SELECT 1 FROM frame WHERE image_path = ?").get(imagePath) !== undefined;
}
