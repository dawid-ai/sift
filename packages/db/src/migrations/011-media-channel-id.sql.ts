// Adds channel_id to media so a downloaded/transcribed video can be linked back to its
// source channel (matched against channel.channel_id) — powers the channel detail's
// "Downloaded from this channel" list. Nullable; existing rows are backfilled from
// metadata_json at startup by backfillMediaChannelIds (NOT in this migration).
export const migration011 = `
ALTER TABLE media ADD COLUMN channel_id TEXT;
CREATE INDEX IF NOT EXISTS idx_media_channel ON media(channel_id);
`;
