// Library organisation: collections, favourites, pinning, and saved searches.
//
// Collections are a separate table rather than more tags. A tag is a label on a video and
// says nothing about order; a collection is a named, ordered set the user curates, and the
// two behave differently everywhere they surface (a tag filters, a collection is browsed).
// Sharing one table would mean tags with a position column that only some rows use.
//
// `favourite` and `pinned_at` live on `media` rather than in a join table: both are exactly
// one boolean-ish fact per row, they are read on every library page, and a join for a flag
// costs a query for nothing. `pinned_at` doubles as the sort key, so pinning is stable in
// the order the user pinned things.
export const migration019 = `
ALTER TABLE media ADD COLUMN favourite INTEGER NOT NULL DEFAULT 0;
ALTER TABLE media ADD COLUMN pinned_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_media_favourite ON media(favourite) WHERE favourite = 1;
CREATE INDEX IF NOT EXISTS idx_media_pinned ON media(pinned_at) WHERE pinned_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS collection (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media_collection (
  collection_id INTEGER NOT NULL REFERENCES collection(id) ON DELETE CASCADE,
  media_id      INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  -- Explicit order inside the collection. Appending uses MAX(position)+1.
  position      INTEGER NOT NULL,
  PRIMARY KEY (collection_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_media_collection_media ON media_collection(media_id);

-- A saved search is a name plus the serialized MediaFilter and free-text query that produced
-- it. The filter is stored as JSON rather than as columns on purpose: MediaFilter gains
-- fields regularly, and a saved search should survive that without a migration each time.
-- Unknown keys are dropped when it is read back (see parseSavedSearch).
CREATE TABLE IF NOT EXISTS saved_search (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL COLLATE NOCASE UNIQUE,
  query      TEXT NOT NULL DEFAULT '',
  filter_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;
