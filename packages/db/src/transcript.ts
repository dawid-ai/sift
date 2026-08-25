import type { SiftDatabase } from "./database";

export interface TranscriptRow {
  id: number;
  media_id: number;
  provider_id: string;
  language: string | null;
  text: string;
  segments_json: string | null;
  model: string | null;
  /** Absolute path of the .txt written to disk, or null. Set after insert via setTranscriptFilePath. */
  file_path: string | null;
  created_at: number;
}
export type NewTranscript = Omit<
  TranscriptRow,
  "id" | "created_at" | "file_path"
>;

export function insertTranscript(
  db: SiftDatabase,
  t: NewTranscript,
): TranscriptRow {
  const created_at = Date.now();
  const res = db
    .prepare(
      `INSERT INTO transcript (media_id, provider_id, language, text, segments_json, model, created_at)
       VALUES (@media_id, @provider_id, @language, @text, @segments_json, @model, @created_at)`,
    )
    .run({ ...t, created_at });
  return getTranscriptById(db, Number(res.lastInsertRowid))!;
}

export function getTranscriptById(
  db: SiftDatabase,
  id: number,
): TranscriptRow | undefined {
  return db
    .prepare<TranscriptRow>("SELECT * FROM transcript WHERE id = @id")
    .get({ id });
}

export function getTranscriptsByMediaId(
  db: SiftDatabase,
  mediaId: number,
): TranscriptRow[] {
  return db
    .prepare<TranscriptRow>(
      "SELECT * FROM transcript WHERE media_id = @mediaId ORDER BY created_at DESC, id DESC",
    )
    .all({ mediaId });
}

export function setTranscriptFilePath(
  db: SiftDatabase,
  id: number,
  filePath: string,
): void {
  db.prepare("UPDATE transcript SET file_path = @filePath WHERE id = @id").run({
    id,
    filePath,
  });
}

/**
 * Replaces a transcript's text and segments after an edit.
 *
 * Both together, never one: `text` is what the FTS index and the AI summary prompt read, and
 * `segments_json` is what the synced viewer and every timed export read. Writing one without
 * the other leaves a video whose search results disagree with its transcript.
 */
export function updateTranscriptContent(
  db: SiftDatabase,
  id: number,
  content: { text: string; segments_json: string | null },
): void {
  db.prepare(
    "UPDATE transcript SET text = @text, segments_json = @segments_json WHERE id = @id",
  ).run({ id, text: content.text, segments_json: content.segments_json });
}

export function deleteTranscript(db: SiftDatabase, id: number): void {
  db.prepare("DELETE FROM transcript WHERE id = ?").run(id);
}
