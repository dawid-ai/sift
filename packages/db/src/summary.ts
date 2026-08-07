import type { SiftDatabase } from "./database";

export interface SummaryRow {
  id: number;
  media_id: number;
  prompt_id: number | null;
  provider_id: string;
  model: string;
  text: string;
  /** Absolute path of the .md written to disk, or null. Set after insert via setSummaryFilePath. */
  file_path: string | null;
  created_at: number;
}
export type NewSummary = Omit<SummaryRow, "id" | "created_at" | "file_path">;

export function insertSummary(db: SiftDatabase, s: NewSummary): SummaryRow {
  const created_at = Date.now();
  const res = db
    .prepare(
      `INSERT INTO summary (media_id, prompt_id, provider_id, model, text, created_at)
       VALUES (@media_id, @prompt_id, @provider_id, @model, @text, @created_at)`,
    )
    .run({ ...s, created_at });
  return getSummaryById(db, Number(res.lastInsertRowid))!;
}

export function getSummaryById(db: SiftDatabase, id: number): SummaryRow | undefined {
  return db.prepare<SummaryRow>("SELECT * FROM summary WHERE id = @id").get({ id });
}

export function getSummariesByMediaId(db: SiftDatabase, mediaId: number): SummaryRow[] {
  return db
    .prepare<SummaryRow>(
      "SELECT * FROM summary WHERE media_id = @mediaId ORDER BY created_at DESC, id DESC",
    )
    .all({ mediaId });
}

export function setSummaryFilePath(db: SiftDatabase, id: number, filePath: string): void {
  db.prepare("UPDATE summary SET file_path = @filePath WHERE id = @id").run({ id, filePath });
}

export function deleteSummary(db: SiftDatabase, id: number): void {
  db.prepare("DELETE FROM summary WHERE id = ?").run(id);
}
