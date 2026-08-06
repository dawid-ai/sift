// Per-media crop region for frame extraction, stored as fractions (0..1) of the video frame
// so it's resolution-independent. When set, ffmpeg crops to this box before scene-detect + OCR,
// so browser chrome / address bars / talking heads outside the slide are excluded. One row per
// media (PK), cascades on media delete.
export const migration014 = `
CREATE TABLE IF NOT EXISTS frame_crop (
  media_id INTEGER PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
  x REAL NOT NULL,
  y REAL NOT NULL,
  w REAL NOT NULL,
  h REAL NOT NULL
);
`;
