/** Minimal decoded-image shape (RGBA rows), matching jpeg-js / canvas ImageData. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray | number[]; // RGBA, length = width*height*4
}

const HASH_W = 9; // 9 columns → 8 adjacent comparisons per row
const HASH_H = 8; // 8 rows → 64 bits total

/**
 * Perceptual difference hash (dHash) as 16 hex chars. Downsamples to 9×8 grayscale
 * (nearest-neighbour — exact resampling doesn't matter for a hash) and sets one bit per
 * adjacent-column comparison. Two frames of the same slide land within a few bits of each
 * other regardless of small compression/lighting changes, so `hammingDistance` catches
 * repeats that `mpdecimate` misses (slide → camera → same slide).
 */
export function computeDHash(img: RgbaImage): string {
  const { width, height, data } = img;
  const gray = (gx: number, gy: number): number => {
    const x = Math.min(width - 1, Math.floor(((gx + 0.5) / HASH_W) * width));
    const y = Math.min(height - 1, Math.floor(((gy + 0.5) / HASH_H) * height));
    const i = (y * width + x) * 4;
    return 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  };
  let bits = "";
  for (let y = 0; y < HASH_H; y++) {
    for (let x = 0; x < HASH_W - 1; x++) {
      bits += gray(x, y) > gray(x + 1, y) ? "1" : "0";
    }
  }
  // 64 bits → 16 hex chars.
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/** Number of differing bits between two dHash hex strings (0 = identical). */
export function hammingDistance(a: string, b: string): number {
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let nibble = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (nibble) {
      dist += nibble & 1;
      nibble >>= 1;
    }
  }
  return dist;
}

/**
 * Max Hamming distance still treated as "the same slide". 6 of 64 bits: identical frames
 * hash 0, a recompressed repeat lands ~2-6, but two DISTINCT slides sharing a template
 * (same title bar / bullet layout, different text) land ~8+ — so 10 wrongly merged them
 * and dropped real slides. Tune on the human pass.
 */
export const DUPLICATE_MAX_DISTANCE = 6;

/** True when `hash` is within `maxDistance` bits of any already-kept hash. */
export function isDuplicateHash(
  hash: string,
  keptHashes: readonly string[],
  maxDistance = DUPLICATE_MAX_DISTANCE,
): boolean {
  return keptHashes.some((k) => hammingDistance(hash, k) <= maxDistance);
}
