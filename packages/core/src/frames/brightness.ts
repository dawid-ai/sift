import type { RgbaImage } from "./dhash";

/**
 * Fraction (0..1) of pixels brighter than `lumaThreshold` (0..255), sampled on a grid.
 * A full-screen (light-themed) slide fills the frame with a bright background and runs ~0.8+;
 * a wide lecture-room shot — dark hall, the slide only a small projected rectangle — runs ~0.35.
 * So it cleanly separates "grab the full-screen slide" from "skip the camera-of-the-screen".
 */
export function brightPixelFraction(img: RgbaImage, lumaThreshold = 180): number {
  const { width, height, data } = img;
  if (width === 0 || height === 0) return 0;
  const cols = Math.min(width, 80);
  const rows = Math.min(height, 45);
  let bright = 0;
  for (let ry = 0; ry < rows; ry++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = Math.floor((cx / cols) * width);
      const y = Math.floor((ry / rows) * height);
      const i = (y * width + x) * 4;
      const luma = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
      if (luma > lumaThreshold) bright++;
    }
  }
  return bright / (cols * rows);
}

/** Min bright fraction for a frame to count as a full-screen (light) slide. Tunable. */
export const MIN_FULLSCREEN_BRIGHT_FRACTION = 0.6;
