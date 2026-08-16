export interface TagColor {
  /** Base hue of this ramp stop, in degrees. */
  hue: number;
  /** Saturation of this ramp stop, in percent. Near-zero on purpose — see RAMP. */
  sat: number;
  bg: string;
  fg: string;
  border: string;
}

/**
 * **The tag ramp — one neutral stop. There is no hue wheel any more.**
 *
 * History, because it took two passes to get here. Tags first got a hue each off a ten-stop
 * wheel; that was cut to three low-saturation stops (sand · slate · stone). Three was still
 * two too many, and the reason is not saturation, it is *meaning*: in the Library view green
 * already means "Done", violet already means a transcript language, and coral already means
 * the source platform. The moment a tag called `data` renders green and a tag called `rust`
 * renders amber, a tag looks like a status and a status looks like a tag. Colour had stopped
 * carrying information anywhere on the screen.
 *
 * A tag's hue never encoded anything — it was a hash, a "these are different strings"
 * affordance, and the tag's own text already does that job perfectly. So the output space is
 * one warm near-neutral, rendered as white-alpha on the Ember surfaces (see `tagTint` in
 * components/tag-chip.tsx). Accent on a tag now means exactly one thing: it is selected.
 *
 * The `local file` marker used to break out of the ramp into a loud amber. It doesn't any
 * more — it was one of the chips teaching the eye that amber is decoration. It carries the
 * words "local file"; that is the marker.
 *
 * Hashing stays exactly as it was — deterministic, case-insensitive, stable across sessions —
 * so `tagColor` keeps its contract even though every input now lands on the same stop.
 */
const RAMP: { hue: number; sat: number }[] = [
  { hue: 28, sat: 6 }, // the one stop: a warm near-neutral, indistinguishable from white-alpha
];

export const TAG_PALETTE: TagColor[] = RAMP.map(({ hue, sat }) => ({
  hue,
  sat,
  bg: `hsl(${hue} ${sat}% 88% / 0.06)`,
  fg: `hsl(${hue} ${sat}% 63%)`,
  border: `hsl(${hue} ${sat}% 90% / 0.1)`,
}));

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic color for a tag name (case-insensitive, matching NOCASE storage). */
export function tagColor(name: string): TagColor {
  const key = name.toLowerCase();
  // Index is always in [0, length) via the modulo, so the assertion is safe.
  return TAG_PALETTE[hash(key) % TAG_PALETTE.length]!;
}
