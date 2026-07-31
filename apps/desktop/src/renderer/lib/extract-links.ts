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
