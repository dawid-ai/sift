/** A painted picture's box inside its container, in container-local pixels. */
export interface PictureBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where `object-contain` actually paints a picture inside a fixed-aspect well.
 *
 * The player's well is 16:9 and the `<video>` is `object-contain`, so anything with a
 * different aspect ratio is letterboxed or pillarboxed. The slide crop is stored as
 * fractions of the VIDEO FRAME — ffmpeg applies it as `iw`/`ih` — so a crop measured
 * against the well is wrong by exactly the bars: a pillarboxed 4:3 slide selected edge to
 * edge came out narrower than drawn, because the same fraction spans fewer real pixels once
 * the bars are excluded.
 *
 * With no intrinsic size yet (metadata not loaded, or an audio-only file) the well is
 * returned unchanged, which is both the safest answer and what 16:9 gives anyway.
 */
export function containedPicture(
  boxWidth: number,
  boxHeight: number,
  videoWidth: number,
  videoHeight: number,
): PictureBox {
  if (
    !(videoWidth > 0) ||
    !(videoHeight > 0) ||
    !(boxWidth > 0) ||
    !(boxHeight > 0)
  )
    return { left: 0, top: 0, width: boxWidth, height: boxHeight };
  const scale = Math.min(boxWidth / videoWidth, boxHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    left: (boxWidth - width) / 2,
    top: (boxHeight - height) / 2,
    width,
    height,
  };
}
