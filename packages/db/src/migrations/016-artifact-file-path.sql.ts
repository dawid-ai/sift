// Transcripts and summaries are now also written to disk (a .txt / .md beside the
// downloads) so the Files tab can "Open" them in the folder. `file_path` is the
// absolute path of that file, NULL for rows created before this migration (or if
// the write failed — the DB text remains the source of truth either way).
export const migration016 = `
ALTER TABLE transcript ADD COLUMN file_path TEXT;
ALTER TABLE summary ADD COLUMN file_path TEXT;
`;
