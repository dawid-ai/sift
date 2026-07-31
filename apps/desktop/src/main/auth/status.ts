const AUTH_ERROR_PATTERNS = [
  "sign in to confirm",
  "confirm you're not a bot",
  "confirm you’re not a bot", // U+2019 curly-apostrophe variant yt-dlp sometimes emits
  "use --cookies",
  "login required",
  "this video is only available",
  "private video",
  "members-only",
];

/** True when yt-dlp stderr looks like an auth/bot-check wall (not a generic network error). */
export function isAuthError(stderr: string): boolean {
  const s = stderr.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((p) => s.includes(p));
}

/** Naive registrable domain (eTLD+1 by last two labels) for grouping/labeling cookies.
 * Display-only — never used to scope which cookies yt-dlp receives (that's the whole jar).
 * Over-collapses multi-part TLDs (bbc.co.uk → co.uk), which is acceptable for a label. */
export function registrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/^\./, "");
  if (!h) return "";
  const labels = h.split(".");
  return labels.length <= 2 ? h : labels.slice(-2).join(".");
}
