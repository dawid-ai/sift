import { describe, expect, it } from "vitest";
import { brightPixelFraction } from "./brightness";
import type { RgbaImage } from "./dhash";

function solid(luma: number, width = 64, height = 36): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = luma;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

describe("brightPixelFraction", () => {
  it("~1 for a bright (full-screen slide) frame, ~0 for a dark one", () => {
    expect(brightPixelFraction(solid(240))).toBeGreaterThan(0.95);
    expect(brightPixelFraction(solid(40))).toBe(0);
  });

  it("splits a mostly-bright frame from a mostly-dark one across the 0.6 line", () => {
    // top half bright, bottom half dark → ~0.5
    const w = 64,
      h = 36;
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = y < h / 2 ? 240 : 30;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    const frac = brightPixelFraction({ width: w, height: h, data });
    expect(frac).toBeGreaterThan(0.4);
    expect(frac).toBeLessThan(0.6);
  });

  it("returns 0 for an empty image", () => {
    expect(
      brightPixelFraction({ width: 0, height: 0, data: new Uint8Array() }),
    ).toBe(0);
  });
});
