import { describe, expect, it } from "vitest";
import { computeDHash, hammingDistance, isDuplicateHash } from "./dhash";
import type { RgbaImage } from "./dhash";

/** Build an RGBA image from a per-pixel gray function (0..255). */
function grayImage(width: number, height: number, fn: (x: number, y: number) => number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const g = fn(x, y);
      data[i] = data[i + 1] = data[i + 2] = g;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("computeDHash", () => {
  it("produces a stable 16-hex-char hash", () => {
    const img = grayImage(64, 64, (x) => (x < 32 ? 20 : 200)); // left dark, right bright
    const hash = computeDHash(img);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(computeDHash(img)).toBe(hash); // deterministic
  });

  it("gives near-identical hashes for the same content with light noise", () => {
    const base = grayImage(64, 64, (x, y) => ((x * 7 + y * 13) % 256));
    const noisy = grayImage(64, 64, (x, y) => Math.min(255, ((x * 7 + y * 13) % 256) + 3));
    expect(hammingDistance(computeDHash(base), computeDHash(noisy))).toBeLessThanOrEqual(4);
  });

  it("gives distant hashes for clearly different content", () => {
    const gradient = grayImage(64, 64, (x) => (x * 4) % 256);
    const inverse = grayImage(64, 64, (x) => 255 - ((x * 4) % 256));
    expect(hammingDistance(computeDHash(gradient), computeDHash(inverse))).toBeGreaterThan(20);
  });
});

describe("isDuplicateHash", () => {
  it("flags a hash within distance of a kept one, ignores far ones", () => {
    const a = "ffffffff00000000";
    const near = "ffffffff00000001"; // 1 bit off
    const far = "0000000011111111";
    expect(isDuplicateHash(near, [a])).toBe(true);
    expect(isDuplicateHash(far, [a])).toBe(false);
    expect(isDuplicateHash(a, [])).toBe(false);
  });
});
