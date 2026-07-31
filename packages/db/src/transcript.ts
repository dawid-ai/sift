import type { SiftDatabase } from "./database";

export interface TranscriptRow {
  id: number;
  media_id: number;
  provider_id: string;
  language: string | null;
  text: string;
  segments_json: string | null;
  model: string | null;
  created_at: number;
}
export type NewTranscript = Omit<TranscriptRow, "id" | "created_at">;

export function insertTranscript(db: SiftDatabase, t: NewTranscript): TranscriptRow {
  const created_at = Date.now();
  const res = db
    .prepare(
      `INSERT INTO transcript (media_id, provider_id, language, text, segments_json, model, created_at)
       VALUES (@media_id, @provider_id, @language, @text, @segments_json, @model, @created_at)`,
    )
    .run({ ...t, created_at });
  return getTranscriptById(db, Number(res.lastInsertRowid))!;
}

export function getTranscriptById(db: SiftDatabase, id: number): TranscriptRow | undefined {
  return db.prepare<TranscriptRow>("SELECT * FROM transcript WHERE id = @id").get({ id });
}

export function getTranscriptsByMediaId(db: SiftDatabase, mediaId: number): TranscriptRow[] {
  return db
    .prepare<TranscriptRow>(
      "SELECT * FROM transcript WHERE media_id = @mediaId ORDER BY created_at DESC, id DESC",
    )
    .all({ mediaId });
}

export function deleteTranscript(db: SiftDatabase, id: number): void {
  db.prepare("DELETE FROM transcript WHERE id = ?").run(id);
}
