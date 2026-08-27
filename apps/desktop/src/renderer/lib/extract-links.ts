/** Distinct http(s) URLs found in a channel description, in first-seen order. yt-dlp's flat
 * dump rarely exposes a channel's links as a field, but they're almost always in the
 * description — this surfaces them as clickable chips. Trailing sentence punctuation is trimmed. */
export function extractLinks(description: string | null): string[] {
  if (!description) return [];
  const matches = description.match(/https?:\/\/[^\s<>()]+/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const url = raw.replace(/[.,;:!?]+$/, "");
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

/** Distinct email addresses found in a channel description, in first-seen order.
 *
 * The business email YouTube shows on the About tab is behind a captcha and yt-dlp never
 * returns it, so the description is the only source Sift can read. Creators who want to be
 * contacted put it there anyway. Lower-cased for de-duplication. */
export function extractEmails(description: string | null): string[] {
  if (!description) return [];
  const matches =
    description.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    const email = raw.replace(/[.,;:!?]+$/, "").toLowerCase();
    if (email && !seen.has(email)) {
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}
