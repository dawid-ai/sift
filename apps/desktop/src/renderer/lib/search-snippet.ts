export interface Segment {
  text: string;
  match: boolean;
}

/** Splits text into alternating plain/matched segments for the query (case-insensitive, literal — no regex). */
export function highlightSegments(text: string, query: string): Segment[] {
  const q = query.trim();
  if (!q) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const lq = q.toLowerCase();
  const out: Segment[] = [];
  let i = 0;
  for (;;) {
    const idx = lower.indexOf(lq, i);
    if (idx === -1) {
      if (i < text.length) out.push({ text: text.slice(i), match: false });
      break;
    }
    if (idx > i) out.push({ text: text.slice(i, idx), match: false });
    out.push({ text: text.slice(idx, idx + q.length), match: true });
    i = idx + q.length;
  }
  return out.length ? out : [{ text, match: false }];
}
