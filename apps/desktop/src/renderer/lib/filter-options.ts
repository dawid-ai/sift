export interface FilterOption {
  value: string;
  label: string;
}

/** Case-insensitive substring match on the label. Blank query returns everything. */
export function filterOptions(
  options: FilterOption[],
  query: string,
): FilterOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => o.label.toLowerCase().includes(q));
}
