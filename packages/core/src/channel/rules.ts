/**
 * Per-channel auto-queue rules: which new uploads are worth downloading without being asked.
 *
 * Pure and framework-free — the desktop app evaluates these against the entries a channel
 * refresh just returned, and enqueues what matches.
 */

export interface ChannelRule {
  /** Off means the rule exists but is not evaluated; deleting is a separate action. */
  enabled: boolean;
  /** Inclusive bounds in seconds. Null means unbounded on that side. */
  minDurationS: number | null;
  maxDurationS: number | null;
  /** Case-insensitive substrings; a video matches if ANY of them is in the title. */
  keywords: string[];
  /** Inclusive lower bound on view count. */
  minViews: number | null;
  /** Skip Shorts. On by default in the UI — the common case is wanting long-form. */
  excludeShorts: boolean;
}

export const EMPTY_RULE: ChannelRule = {
  enabled: false,
  minDurationS: null,
  maxDurationS: null,
  keywords: [],
  minViews: null,
  excludeShorts: true,
};

/** One video as a refresh reports it — the subset a rule can test. */
export interface RuleCandidate {
  title: string;
  durationSec: number | null;
  viewCount: number | null;
  isShort: boolean;
}

/** Splits a comma-separated field into trimmed, non-empty keywords. */
export function parseKeywords(raw: string): string[] {
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/**
 * Why a candidate was rejected, or null when it matches. The reason is what makes an
 * auto-queue rule debuggable — "nothing was queued" with no explanation is the failure mode
 * every rules engine has.
 */
export type RuleRejection =
  | "disabled"
  | "short"
  | "too-short"
  | "too-long"
  | "unknown-duration"
  | "too-few-views"
  | "unknown-views"
  | "no-keyword";

export function evaluateRule(
  rule: ChannelRule,
  video: RuleCandidate,
): RuleRejection | null {
  if (!rule.enabled) return "disabled";
  if (rule.excludeShorts && video.isShort) return "short";

  // A bound the video can't be tested against rejects it rather than passing it. Auto-queue
  // spends bandwidth and disk without asking, so "unknown" must not mean "yes".
  if (rule.minDurationS !== null || rule.maxDurationS !== null) {
    if (video.durationSec === null) return "unknown-duration";
    if (rule.minDurationS !== null && video.durationSec < rule.minDurationS)
      return "too-short";
    if (rule.maxDurationS !== null && video.durationSec > rule.maxDurationS)
      return "too-long";
  }

  if (rule.minViews !== null) {
    if (video.viewCount === null) return "unknown-views";
    if (video.viewCount < rule.minViews) return "too-few-views";
  }

  if (rule.keywords.length > 0) {
    const title = video.title.toLowerCase();
    const hit = rule.keywords.some((k) => title.includes(k.toLowerCase()));
    if (!hit) return "no-keyword";
  }

  return null;
}

/** Convenience over `evaluateRule` for callers that only need the verdict. */
export function matchesRule(rule: ChannelRule, video: RuleCandidate): boolean {
  return evaluateRule(rule, video) === null;
}

/** Human wording for a rejection, for the rule editor's preview list. */
export const REJECTION_LABEL: Record<RuleRejection, string> = {
  disabled: "rule is off",
  short: "is a Short",
  "too-short": "shorter than the minimum",
  "too-long": "longer than the maximum",
  "unknown-duration": "length unknown",
  "too-few-views": "below the view threshold",
  "unknown-views": "view count unknown",
  "no-keyword": "no keyword matched",
};

/** A one-line description of what a rule will queue, for the channel list. */
export function describeRule(rule: ChannelRule): string {
  if (!rule.enabled) return "Off";
  const parts: string[] = [];
  if (rule.minDurationS !== null && rule.maxDurationS !== null)
    parts.push(
      `${Math.round(rule.minDurationS / 60)}–${Math.round(rule.maxDurationS / 60)} min`,
    );
  else if (rule.minDurationS !== null)
    parts.push(`over ${Math.round(rule.minDurationS / 60)} min`);
  else if (rule.maxDurationS !== null)
    parts.push(`under ${Math.round(rule.maxDurationS / 60)} min`);
  if (rule.minViews !== null)
    parts.push(`${rule.minViews.toLocaleString()}+ views`);
  if (rule.keywords.length > 0)
    parts.push(`matching ${rule.keywords.join(", ")}`);
  if (rule.excludeShorts) parts.push("no Shorts");
  return parts.length > 0 ? parts.join(" · ") : "Every new upload";
}
