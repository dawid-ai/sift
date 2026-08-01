/** Page numbers to render in a numbered pager, with "…" marking omitted gaps. Always keeps
 * the first, last, and current±1 pages. `current` is 1-based. Returns [] for count < 1. */
export function pageWindow(current: number, count: number): (number | "…")[] {
  if (count < 1) return [];
  const keep = new Set([1, count, current - 1, current, current + 1]);
  const shown = [...keep].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of shown) {
    if (p - prev > 1) out.push("…"); // gap between the last shown page and this one
    out.push(p);
    prev = p;
  }
  return out;
}
