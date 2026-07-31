export const migration008 = `
CREATE TABLE IF NOT EXISTS channel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  handle TEXT,
  title TEXT NOT NULL,
  description TEXT,
  uploader TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  follower_count INTEGER,
  video_count INTEGER,
  last_seen_video_id TEXT,
  new_count INTEGER NOT NULL DEFAULT 0,
  last_checked INTEGER,
  created_at INTEGER NOT NULL
);
`;
