/** Lowercase, keep only the segment before the first `-` (`"en-US"` → `"en"`). */
export function baseLangCode(code: string): string {
  return code.toLowerCase().split("-")[0] ?? "";
}

/**
 * Picks one caption language = the first AVAILABLE of `[videoLanguage, ...preferred]`
 * (all base-coded, deduped). Detected wins whenever captions for it exist; the
 * preferred list is the fallback. If no candidate is available, returns the top
 * candidate as a best-effort attempt; with no candidates at all, `"en"`.
 */
export function pickTranscriptLanguage(input: {
  videoLanguage: string | null;
  available: string[];
  preferred: string[];
}): string {
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const raw of [input.videoLanguage, ...input.preferred]) {
    if (!raw) continue;
    const code = baseLangCode(raw);
    if (code && !seen.has(code)) {
      seen.add(code);
      candidates.push(code);
    }
  }
  const available = new Set(input.available.map(baseLangCode));
  return candidates.find((c) => available.has(c)) ?? candidates[0] ?? "en";
}
