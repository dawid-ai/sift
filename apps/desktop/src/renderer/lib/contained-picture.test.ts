import { describe, it, expect } from "vitest";
import { containedPicture } from "./contained-picture";

describe("containedPicture", () => {
  it("fills the well when the video matches its aspect ratio", () => {
    expect(containedPicture(1600, 900, 1920, 1080)).toEqual({
      left: 0,
      top: 0,
      width: 1600,
      height: 900,
    });
  });

  it("pillarboxes a 4:3 video in a 16:9 well", () => {
    const p = containedPicture(1600, 900, 640, 480);
    expect(p).toEqual({ left: 200, top: 0, width: 1200, height: 900 });
    // The bug this exists for: a slide spanning the full picture width is 1.0 of the
    // picture but only 0.75 of the well, and ffmpeg reads the fraction as the frame's.
    expect(p.width / 1600).toBeCloseTo(0.75, 5);
  });

  it("letterboxes a vertical video", () => {
    expect(containedPicture(1600, 900, 1080, 1920)).toEqual({
      left: 546.875,
      top: 0,
      width: 506.25,
      height: 900,
    });
  });

  it("falls back to the well before the intrinsic size is known", () => {
    expect(containedPicture(1600, 900, 0, 0)).toEqual({
      left: 0,
      top: 0,
      width: 1600,
      height: 900,
    });
  });

  it("round-trips a point through the picture mapping", () => {
    // A click 200px in from the left edge of a pillarboxed 4:3 picture.
    const p = containedPicture(1600, 900, 640, 480);
    const frac = (200 - p.left) / p.width;
    expect(frac).toBeCloseTo(0, 5);
    const back = p.left + frac * p.width;
    expect(back).toBeCloseTo(200, 5);
  });
});
