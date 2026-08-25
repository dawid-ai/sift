// Per-channel auto-queue rules.
//
// One row per channel, keyed by the channel's own id so the rule survives the channel row
// being re-upserted by a refresh. Keywords are a JSON array in one column rather than a
// child table: they are read and written together, always as a set, and never queried
// across channels.
//
// `last_queued_at` is what keeps auto-queue idempotent. A refresh reports the newest N
// uploads every time, so without a watermark the same video is queued on every tick.
export const migration020 = `
CREATE TABLE IF NOT EXISTS channel_rule (
  channel_id      TEXT PRIMARY KEY REFERENCES channel(channel_id) ON DELETE CASCADE,
  enabled         INTEGER NOT NULL DEFAULT 0,
  min_duration_s  INTEGER,
  max_duration_s  INTEGER,
  keywords_json   TEXT NOT NULL DEFAULT '[]',
  min_views       INTEGER,
  exclude_shorts  INTEGER NOT NULL DEFAULT 1,
  last_queued_id  TEXT,
  last_queued_at  INTEGER,
  updated_at      INTEGER NOT NULL
);
`;
