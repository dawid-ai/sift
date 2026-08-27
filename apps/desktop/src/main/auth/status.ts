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

/** The single line the queue stores and the renderer flags on, instead of yt-dlp's paragraph. */
export const MEMBERS_ONLY_MESSAGE =
  "Members-only video — this channel requires a membership to watch it.";

const MEMBERS_ONLY_PATTERNS = [
  "members-only",
  "join this channel to get access",
  "available to this channel's members",
];

/**
 * True when yt-dlp refused because the video is behind a channel membership.
 *
 * Distinct from `isAuthError` on purpose: a members-only wall is not a broken session, and
 * telling someone to sign in again is wrong advice — a valid session that isn't a member of
 * that channel gets this same refusal every time. Signing in fixes nothing; joining does.
 */
export function isMembersOnlyError(stderr: string): boolean {
  const s = stderr.toLowerCase();
  return MEMBERS_ONLY_PATTERNS.some((p) => s.includes(p));
}

/** True when yt-dlp stderr looks like an auth/bot-check wall (not a generic network error). */
export function isAuthError(stderr: string): boolean {
  // A membership wall matches "members-only" (and "this video is only available…") but is a
  // different problem, so it must never be reported as an expired session.
  if (isMembersOnlyError(stderr)) return false;
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
