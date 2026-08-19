// Full-text search index.
//
// One FTS5 row per media, aggregating the four things worth searching: the title
// and uploader off `media`, and every transcript and summary body belonging to it.
// Aggregating rather than indexing each child row separately is what keeps the
// "one hit per media" contract in searchMedia — otherwise a video with three
// transcripts returns three hits and every caller has to dedupe.
//
// STORAGE: this is a standalone (not external-content) table, so the text is
// COPIED. That is deliberate. External-content FTS5 points at exactly one content
// table, and the searchable text here spans three; the alternative is three FTS
// tables plus a UNION at query time. The cost is roughly a second copy of the
// transcript corpus.
//
// TRIGGERS: because a row aggregates child tables, any write to media, transcript
// or summary has to rebuild that media's row wholesale — SQLite triggers can't
// call a function, so the same DELETE+INSERT appears in each. Rebuilding is
// cheap: it touches exactly one media id.
//
// The media-delete case needs no special handling. Children cascade, their delete
// triggers fire and try to rebuild a media row that is already gone, and the
// INSERT..SELECT simply selects nothing.
const REBUILD = (id: string) => `
  DELETE FROM media_fts WHERE media_id = ${id};
  INSERT INTO media_fts (media_id, title, uploader, transcript, summary)
  SELECT m.id,
         COALESCE(m.title, ''),
         COALESCE(m.uploader, ''),
         COALESCE((SELECT group_concat(t.text, ' ') FROM transcript t WHERE t.media_id = m.id), ''),
         COALESCE((SELECT group_concat(s.text, ' ') FROM summary s WHERE s.media_id = m.id), '')
    FROM media m WHERE m.id = ${id};`;

export const migration018MediaFts = `
-- remove_diacritics 2 so "Grenzen"/"typage" style content matches unaccented input.
CREATE VIRTUAL TABLE media_fts USING fts5(
  media_id UNINDEXED,
  title,
  uploader,
  transcript,
  summary,
  tokenize = "unicode61 remove_diacritics 2"
);

CREATE TRIGGER media_fts_ai AFTER INSERT ON media BEGIN ${REBUILD("NEW.id")} END;
CREATE TRIGGER media_fts_au AFTER UPDATE OF title, uploader ON media BEGIN ${REBUILD("NEW.id")} END;
CREATE TRIGGER media_fts_ad AFTER DELETE ON media BEGIN
  DELETE FROM media_fts WHERE media_id = OLD.id;
END;

CREATE TRIGGER transcript_fts_ai AFTER INSERT ON transcript BEGIN ${REBUILD("NEW.media_id")} END;
CREATE TRIGGER transcript_fts_au AFTER UPDATE OF text ON transcript BEGIN ${REBUILD("NEW.media_id")} END;
CREATE TRIGGER transcript_fts_ad AFTER DELETE ON transcript BEGIN ${REBUILD("OLD.media_id")} END;

CREATE TRIGGER summary_fts_ai AFTER INSERT ON summary BEGIN ${REBUILD("NEW.media_id")} END;
CREATE TRIGGER summary_fts_au AFTER UPDATE OF text ON summary BEGIN ${REBUILD("NEW.media_id")} END;
CREATE TRIGGER summary_fts_ad AFTER DELETE ON summary BEGIN ${REBUILD("OLD.media_id")} END;

-- Backfill every media row that already exists.
INSERT INTO media_fts (media_id, title, uploader, transcript, summary)
SELECT m.id,
       COALESCE(m.title, ''),
       COALESCE(m.uploader, ''),
       COALESCE((SELECT group_concat(t.text, ' ') FROM transcript t WHERE t.media_id = m.id), ''),
       COALESCE((SELECT group_concat(s.text, ' ') FROM summary s WHERE s.media_id = m.id), '')
  FROM media m;
`;
