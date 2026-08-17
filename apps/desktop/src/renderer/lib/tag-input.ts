/**
 * Parsing for the comma-separated tag field.
 *
 * The field accepts several tags at once ("Add tags (comma-separated)…") and `tags.add` is
 * called per name on commit. Suggestions therefore have to follow the *term being typed*, not
 * the whole field: with "systems, sq" in the box the user is writing "sq", and matching the
 * literal string "systems, sq" against tag names finds nothing, so the popover vanished the
 * moment a comma was typed. Picking a suggestion has the same boundary — it replaces the term,
 * not the field, so the tags already typed in front of it survive.
 */

/** Split the field into the segments already separated by commas and the term being typed. */
export function splitTagInput(value: string): {
  before: string[];
  term: string;
} {
  const parts = value.split(",");
  // The last segment is the caret's segment — it is what the user is still writing.
  const term = (parts.pop() ?? "").trim();
  const before = parts.map((p) => p.trim()).filter(Boolean);
  return { before, term };
}

/**
 * Tags to offer for the term being typed.
 *
 * Excludes names already attached to the media *and* names already typed earlier in the same
 * field, so a two-tag entry cannot suggest the tag sitting one segment to the left.
 * An empty term yields nothing — same as an empty field, so a trailing comma does not dump the
 * entire tag list over the panel below.
 */
export function tagSuggestions(
  value: string,
  all: string[],
  attached: string[],
): string[] {
  const { before, term } = splitTagInput(value);
  if (!term) return [];
  // NOCASE storage, so matching and de-duping are both case-insensitive.
  const taken = new Set([...attached, ...before].map((t) => t.toLowerCase()));
  const q = term.toLowerCase();
  return all.filter(
    (n) => n.toLowerCase().includes(q) && !taken.has(n.toLowerCase()),
  );
}

/** Replace the term being typed with `pick`, keeping every earlier segment intact. */
export function applyTagPick(value: string, pick: string): string {
  return [...splitTagInput(value).before, pick].join(", ");
}
