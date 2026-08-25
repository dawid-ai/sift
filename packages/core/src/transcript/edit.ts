import type { TranscriptSegment } from "./types";

/**
 * Pure transcript editing. Every function returns new segments and never mutates its input,
 * so the renderer can keep an undo stack by holding onto the previous array.
 */

export interface ReplaceOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

/** Escapes a string so it can be used as a literal inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds the matcher for find/replace.
 *
 * The needle is always escaped — the field in the editor is a search box, not a regex box.
 * Someone replacing `(intro)` or `$5.00` must not have those read as syntax, and a user-typed
 * pattern reaching `new RegExp` unescaped is also how a transcript edit turns into a hang on
 * a catastrophically backtracking expression.
 */
function matcher(find: string, opts: ReplaceOptions): RegExp {
  const body = escapeRegExp(find);
  // \b is meaningless next to a non-word character, so whole-word only wraps the sides that
  // begin and end with one. Without this, searching "c++" with whole-word on never matches.
  const left = /^\w/.test(find) ? "\\b" : "";
  const right = /\w$/.test(find) ? "\\b" : "";
  const pattern = opts.wholeWord ? `${left}${body}${right}` : body;
  return new RegExp(pattern, opts.caseSensitive ? "g" : "gi");
}

/** How many segments contain `find`, and how many occurrences in total. */
export function countMatches(
  segments: TranscriptSegment[],
  find: string,
  opts: ReplaceOptions = {},
): { segments: number; occurrences: number } {
  if (!find) return { segments: 0, occurrences: 0 };
  const re = matcher(find, opts);
  let segmentCount = 0;
  let occurrences = 0;
  for (const seg of segments) {
    re.lastIndex = 0;
    const hits = seg.text.match(re);
    if (hits && hits.length > 0) {
      segmentCount++;
      occurrences += hits.length;
    }
  }
  return { segments: segmentCount, occurrences };
}

/** Replaces every occurrence of `find` with `replace` across all segments. */
export function replaceAll(
  segments: TranscriptSegment[],
  find: string,
  replace: string,
  opts: ReplaceOptions = {},
): TranscriptSegment[] {
  if (!find) return segments;
  const re = matcher(find, opts);
  return segments.map((seg) => {
    re.lastIndex = 0;
    // A `$` in the replacement is literal here: `$&`/`$1` in a replacement string is a
    // feature of regex tooling, not of a find-and-replace box in a transcript.
    const text = seg.text.replace(re, () => replace);
    return text === seg.text ? seg : { ...seg, text };
  });
}

/** Replaces the text of one segment. Out-of-range indexes are ignored. */
export function setSegmentText(
  segments: TranscriptSegment[],
  index: number,
  text: string,
): TranscriptSegment[] {
  if (index < 0 || index >= segments.length) return segments;
  return segments.map((seg, i) => (i === index ? { ...seg, text } : seg));
}

/**
 * Matches a `Speaker: ` prefix.
 *
 * Two bounds, and both are needed: at most three words and at most 40 characters. Length
 * alone lets an ordinary sentence qualify — "the rule is this: never ship on a Friday" would
 * report a speaker called "the rule is this" and strip it on the next edit. Real labels
 * ("Ana", "Dr. Jane Smith", "INTERVIEWER", "Speaker 1") are short *and* few words.
 */
const SPEAKER_RE = /^([^\s:]+(?:[^\S\n][^\s:]+){0,2}):[^\S\n]+/;

function speakerMatch(text: string): RegExpExecArray | null {
  const m = SPEAKER_RE.exec(text);
  return m && (m[1]?.length ?? 0) <= 40 ? m : null;
}

/** The speaker labelled on a segment, or null. */
export function speakerOf(segment: TranscriptSegment): string | null {
  return speakerMatch(segment.text)?.[1]?.trim() ?? null;
}

/** The segment's text with any speaker prefix removed. */
export function textWithoutSpeaker(segment: TranscriptSegment): string {
  const m = speakerMatch(segment.text);
  return m ? segment.text.slice(m[0].length) : segment.text;
}

/**
 * Labels a segment with a speaker, replacing any label already there. An empty name removes
 * the label.
 *
 * The label is a `Name: ` prefix on the text rather than a new field, because that is what
 * survives every export path the app already has — SRT, VTT, Markdown, and the AI summary
 * prompt all carry segment text and nothing else.
 */
export function setSpeaker(
  segments: TranscriptSegment[],
  index: number,
  speaker: string,
): TranscriptSegment[] {
  if (index < 0 || index >= segments.length) return segments;
  const name = speaker.trim();
  return segments.map((seg, i) => {
    if (i !== index) return seg;
    const bare = textWithoutSpeaker(seg);
    return { ...seg, text: name ? `${name}: ${bare}` : bare };
  });
}

/** Applies a speaker label to a run of segments, inclusive of both ends. */
export function setSpeakerRange(
  segments: TranscriptSegment[],
  from: number,
  to: number,
  speaker: string,
): TranscriptSegment[] {
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(segments.length - 1, Math.max(from, to));
  let out = segments;
  for (let i = lo; i <= hi; i++) out = setSpeaker(out, i, speaker);
  return out;
}

/**
 * Shifts every timestamp by `deltaSeconds`, clamped at zero.
 *
 * Clamping rather than allowing negatives: a caption track that starts before the video does
 * is not a thing any player can honour, and letting one segment go negative while the next
 * stays positive silently reorders the transcript.
 */
export function shiftTimes(
  segments: TranscriptSegment[],
  deltaSeconds: number,
): TranscriptSegment[] {
  if (deltaSeconds === 0) return segments;
  return segments.map((seg) => ({
    ...seg,
    start: Math.max(0, seg.start + deltaSeconds),
    end: Math.max(0, seg.end + deltaSeconds),
  }));
}

/** Sets one segment's start and end, keeping start ≤ end and both non-negative. */
export function setSegmentTimes(
  segments: TranscriptSegment[],
  index: number,
  start: number,
  end: number,
): TranscriptSegment[] {
  if (index < 0 || index >= segments.length) return segments;
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.max(lo, Math.max(0, Math.max(start, end)));
  return segments.map((seg, i) =>
    i === index ? { ...seg, start: lo, end: hi } : seg,
  );
}

/** Drops a segment. */
export function removeSegment(
  segments: TranscriptSegment[],
  index: number,
): TranscriptSegment[] {
  if (index < 0 || index >= segments.length) return segments;
  return segments.filter((_, i) => i !== index);
}

/**
 * Merges a segment into the one before it: the texts join with a space, and the span runs
 * from the earlier start to the later end.
 */
export function mergeWithPrevious(
  segments: TranscriptSegment[],
  index: number,
): TranscriptSegment[] {
  if (index <= 0 || index >= segments.length) return segments;
  const prev = segments[index - 1]!;
  const cur = segments[index]!;
  const merged: TranscriptSegment = {
    start: Math.min(prev.start, cur.start),
    end: Math.max(prev.end, cur.end),
    text: `${prev.text.trim()} ${cur.text.trim()}`.trim(),
  };
  return [
    ...segments.slice(0, index - 1),
    merged,
    ...segments.slice(index + 1),
  ];
}

/** True when two segment lists differ in any field — drives the editor's dirty flag. */
export function segmentsEqual(
  a: TranscriptSegment[],
  b: TranscriptSegment[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((seg, i) => {
    const other = b[i]!;
    return (
      seg.start === other.start &&
      seg.end === other.end &&
      seg.text === other.text
    );
  });
}
