// Persists a channel's whole video catalogue so outlier scoring has a real baseline.
// Before this, the channel detail scored a video against the median of whatever page it had
// just fetched (25 by default), which made "2x the median" mean almost nothing.
//
// One row per (channel, video), updated in place on each stats sync — no per-refresh history.
// `position` is the video's index in the newest-first listing at sync time; it is the only
// age signal a flat yt-dlp listing carries (there is no upload date), and it is what "Oldest"
// ordering reads when the list is served from this table.
export const migration021 = `
CREATE TABLE IF NOT EXISTS channel_video (
  channel_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  duration_s INTEGER,
  view_count INTEGER,
  is_short INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (channel_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_video_type ON channel_video(channel_id, content_type);
ALTER TABLE channel ADD COLUMN stats_synced_at INTEGER;
`;
