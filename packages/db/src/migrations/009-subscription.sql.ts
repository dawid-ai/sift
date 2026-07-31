export const migration009 = `
CREATE TABLE IF NOT EXISTS subscription (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  handle TEXT,
  title TEXT NOT NULL,
  avatar_url TEXT,
  follower_count INTEGER,
  synced_at INTEGER NOT NULL
);
`;
