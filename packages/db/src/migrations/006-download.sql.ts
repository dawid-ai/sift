export const migration006 = `
CREATE TABLE IF NOT EXISTS download (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  format_id TEXT NOT NULL,
  label TEXT NOT NULL,
  ext TEXT,
  height INTEGER,
  file_path TEXT,
  file_size INTEGER,
  status TEXT NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_download_media ON download(media_id);

-- Move each existing inline download (done/error) into a 'legacy' download row.
INSERT INTO download (media_id, format_id, label, ext, height, file_path, file_size, status, error, created_at, updated_at)
SELECT id, 'legacy', 'Downloaded', NULL, NULL,
  CASE WHEN download_status = 'done' THEN download_path ELSE NULL END,
  NULL, download_status, NULL, created_at, updated_at
FROM media
WHERE download_status IN ('done', 'error');

-- Merge duplicate media rows sharing a source_url into the earliest (keeper).
-- Re-point all children to the keeper BEFORE deleting non-keepers, so the
-- ON DELETE CASCADE removes nothing.
UPDATE download SET media_id = (
  SELECT MIN(m.id) FROM media m WHERE m.source_url = (SELECT source_url FROM media WHERE id = download.media_id)
);
UPDATE transcript SET media_id = (
  SELECT MIN(m.id) FROM media m WHERE m.source_url = (SELECT source_url FROM media WHERE id = transcript.media_id)
);
UPDATE summary SET media_id = (
  SELECT MIN(m.id) FROM media m WHERE m.source_url = (SELECT source_url FROM media WHERE id = summary.media_id)
);
DELETE FROM media WHERE id NOT IN (SELECT MIN(id) FROM media GROUP BY source_url);
`;
