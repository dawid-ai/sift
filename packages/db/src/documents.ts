import type { SiftDatabase } from "./database";

export interface DocumentRow {
  id: number;
  media_id: number;
  format: string; // "md" | "pdf"
  path: string;
  provider_id: string | null; // null = raw (no-AI) tier
  model: string | null;
  created_at: number;
}
export type NewDocument = Omit<DocumentRow, "id" | "created_at">;

export function insertDocument(db: SiftDatabase, d: NewDocument): DocumentRow {
  const created_at = Date.now();
  const res = db
    .prepare(
      `INSERT INTO document (media_id, format, path, provider_id, model, created_at)
       VALUES (@media_id, @format, @path, @provider_id, @model, @created_at)`,
    )
    .run({ ...d, created_at });
  return db
    .prepare<DocumentRow>("SELECT * FROM document WHERE id = @id")
    .get({ id: Number(res.lastInsertRowid) })!;
}

/** Documents for a media, newest first. */
export function getDocumentsByMediaId(
  db: SiftDatabase,
  mediaId: number,
): DocumentRow[] {
  return db
    .prepare<DocumentRow>(
      "SELECT * FROM document WHERE media_id = @mediaId ORDER BY created_at DESC, id DESC",
    )
    .all({ mediaId });
}

export function deleteDocument(db: SiftDatabase, id: number): void {
  db.prepare("DELETE FROM document WHERE id = ?").run(id);
}
