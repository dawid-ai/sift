export const migration002 = `
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url TEXT NOT NULL,
  platform_id TEXT NOT NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  uploader TEXT,
  uploader_url TEXT,
  duration_s INTEGER,
  thumbnail_path TEXT,
  view_count INTEGER,
  like_count INTEGER,
  published_at INTEGER,
  metadata_json TEXT,
  download_path TEXT,
  download_status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;
