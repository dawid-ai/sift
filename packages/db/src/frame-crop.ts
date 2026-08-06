import type { SiftDatabase } from "./database";

/** A crop region as fractions (0..1) of the video frame. */
export interface FrameCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function getFrameCrop(db: SiftDatabase, mediaId: number): FrameCrop | undefined {
  return db
    .prepare<FrameCrop>("SELECT x, y, w, h FROM frame_crop WHERE media_id = @mediaId")
    .get({ mediaId });
}

/** Sets (or replaces) the crop for a media. */
export function setFrameCrop(db: SiftDatabase, mediaId: number, crop: FrameCrop): void {
  db.prepare(
    `INSERT INTO frame_crop (media_id, x, y, w, h) VALUES (@media_id, @x, @y, @w, @h)
     ON CONFLICT(media_id) DO UPDATE SET x = @x, y = @y, w = @w, h = @h`,
  ).run({ media_id: mediaId, ...crop });
}

export function clearFrameCrop(db: SiftDatabase, mediaId: number): void {
  db.prepare("DELETE FROM frame_crop WHERE media_id = ?").run(mediaId);
}
