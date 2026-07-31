export const migration010 = `
CREATE TABLE IF NOT EXISTS media_tag (
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  name     TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (media_id, name)
);
CREATE INDEX IF NOT EXISTS idx_media_tag_name ON media_tag(name);
`;
