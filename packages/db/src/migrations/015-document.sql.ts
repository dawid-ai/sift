// Generated document/report files (transcript + selected slides, optionally AI-distilled),
// tracked per media so the Files tab can list everything created for a video. `provider_id`
// and `model` are NULL for the raw (no-AI) tier. Cascades on media delete.
export const migration015 = `
CREATE TABLE IF NOT EXISTS document (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  path TEXT NOT NULL,
  provider_id TEXT,
  model TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_document_media ON document(media_id);
`;
