export const migration007 = `
CREATE TABLE IF NOT EXISTS queue_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  status TEXT NOT NULL,
  ops_json TEXT,
  media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  queue_order INTEGER NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_queue_order ON queue_item(queue_order);
`;
