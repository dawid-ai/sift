export const migration005Summary = `
CREATE TABLE IF NOT EXISTS summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  prompt_id INTEGER REFERENCES prompt(id),
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_summary_media ON summary(media_id);
`;
