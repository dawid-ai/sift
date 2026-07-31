export const migration003 = `
CREATE TABLE IF NOT EXISTS transcript (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  language TEXT,
  text TEXT NOT NULL,
  segments_json TEXT,
  model TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transcript_media ON transcript(media_id);
`;
