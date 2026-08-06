// Frames extracted from a downloaded video that carry data (slides, charts, on-screen
// text). One row per KEPT frame after the scene-select + OCR keep-frame filter. ts_ms
// aligns each frame to the timed transcript. phash is a perceptual hash for de-dup
// (nullable — mpdecimate already collapses most holds). kind tags what the classifier
// thought it was ("slide" today; "chart"/"logo"/… once a VLM lands).
export const migration012 = `
CREATE TABLE IF NOT EXISTS frame (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  ts_ms INTEGER NOT NULL,
  image_path TEXT NOT NULL,
  ocr_text TEXT,
  ocr_confidence REAL,
  phash TEXT,
  kind TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_frame_media ON frame(media_id);
`;
