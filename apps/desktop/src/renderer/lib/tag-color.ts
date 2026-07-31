export interface TagColor {
  bg: string;
  fg: string;
  border: string;
}

// A fixed set of hues; each yields a low-alpha bg, saturated border, readable fg.
const HUES = [210, 145, 275, 25, 340, 190, 95, 50, 0, 300];

export const TAG_PALETTE: TagColor[] = HUES.map((h) => ({
  bg: `hsl(${h} 70% 50% / 0.15)`,
  fg: `hsl(${h} 65% 45%)`,
  border: `hsl(${h} 60% 50% / 0.35)`,
}));

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic color for a tag name (case-insensitive, matching NOCASE storage). */
export function tagColor(name: string): TagColor {
  // Index is always in [0, length) via the modulo, so the assertion is safe.
  return TAG_PALETTE[hash(name.toLowerCase()) % TAG_PALETTE.length]!;
}
