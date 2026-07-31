/**
 * Union all tags across a set of library items, collapsing names that only
 * differ by case (the DB's tag PK is case-insensitive across a single
 * media row, but two different rows can each hold a different casing of
 * the "same" tag). The first-seen casing wins; the result is sorted
 * alphabetically.
 */
export function unionTags(items: { tags: string[] }[]): string[] {
  const seen = new Map<string, string>();
  for (const item of items) {
    for (const tag of item.tags) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, tag);
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
