import { describe, expect, it } from "vitest";
import type { TranscriptSegment } from "./types";
import {
  countMatches,
  mergeWithPrevious,
  removeSegment,
  replaceAll,
  segmentsEqual,
  setSegmentText,
  setSegmentTimes,
  setSpeaker,
  setSpeakerRange,
  shiftTimes,
  speakerOf,
  textWithoutSpeaker,
} from "./edit";

const seg = (start: number, end: number, text: string): TranscriptSegment => ({
  start,
  end,
  text,
});

const SAMPLE: TranscriptSegment[] = [
  seg(0, 2, "Hello there"),
  seg(2, 4, "hello again"),
  seg(4, 6, "Goodbye"),
];

describe("replaceAll", () => {
  it("replaces case-insensitively by default", () => {
    const out = replaceAll(SAMPLE, "hello", "hi");
    expect(out.map((s) => s.text)).toEqual(["hi there", "hi again", "Goodbye"]);
  });

  it("honours case sensitivity", () => {
    const out = replaceAll(SAMPLE, "hello", "hi", { caseSensitive: true });
    expect(out.map((s) => s.text)).toEqual([
      "Hello there",
      "hi again",
      "Goodbye",
    ]);
  });

  it("honours whole-word", () => {
    const input = [seg(0, 1, "cat cathode cat")];
    expect(replaceAll(input, "cat", "dog", { wholeWord: true })[0]?.text).toBe(
      "dog cathode dog",
    );
    expect(replaceAll(input, "cat", "dog")[0]?.text).toBe("dog doghode dog");
  });

  it("treats the needle as literal text, not a pattern", () => {
    const input = [seg(0, 1, "the price is $5.00 (net)")];
    expect(replaceAll(input, "$5.00", "$6.00")[0]?.text).toBe(
      "the price is $6.00 (net)",
    );
    expect(replaceAll(input, "(net)", "[net]")[0]?.text).toBe(
      "the price is $5.00 [net]",
    );
    // A regex metacharacter finds nothing rather than matching everything.
    expect(replaceAll(input, ".*", "X")[0]?.text).toBe(
      "the price is $5.00 (net)",
    );
  });

  it("treats $ in the replacement as literal", () => {
    const input = [seg(0, 1, "cost")];
    expect(replaceAll(input, "cost", "$&$1")[0]?.text).toBe("$&$1");
  });

  it("whole-word still matches a needle that starts or ends non-word", () => {
    const input = [seg(0, 1, "I use c++ daily")];
    expect(replaceAll(input, "c++", "rust", { wholeWord: true })[0]?.text).toBe(
      "I use rust daily",
    );
  });

  it("returns the same array reference for an empty needle", () => {
    expect(replaceAll(SAMPLE, "", "x")).toBe(SAMPLE);
  });

  it("does not mutate its input", () => {
    const before = JSON.stringify(SAMPLE);
    replaceAll(SAMPLE, "hello", "hi");
    expect(JSON.stringify(SAMPLE)).toBe(before);
  });
});

describe("countMatches", () => {
  it("counts segments and occurrences separately", () => {
    const input = [seg(0, 1, "a a a"), seg(1, 2, "a"), seg(2, 3, "b")];
    expect(countMatches(input, "a")).toEqual({ segments: 2, occurrences: 4 });
  });

  it("is zero for an empty needle", () => {
    expect(countMatches(SAMPLE, "")).toEqual({ segments: 0, occurrences: 0 });
  });
});

describe("speaker labels", () => {
  it("adds, reads, replaces, and removes a label", () => {
    let out = setSpeaker(SAMPLE, 0, "Ana");
    expect(out[0]?.text).toBe("Ana: Hello there");
    expect(speakerOf(out[0]!)).toBe("Ana");

    out = setSpeaker(out, 0, "Bo");
    expect(out[0]?.text).toBe("Bo: Hello there");

    out = setSpeaker(out, 0, "  ");
    expect(out[0]?.text).toBe("Hello there");
    expect(speakerOf(out[0]!)).toBeNull();
  });

  it("does not mistake a mid-sentence colon for a speaker", () => {
    const input = [seg(0, 1, "the rule is this: never ship on a Friday")];
    expect(speakerOf(input[0]!)).toBeNull();
    expect(textWithoutSpeaker(input[0]!)).toBe(input[0]!.text);
  });

  it("labels a range in either direction", () => {
    const out = setSpeakerRange(SAMPLE, 2, 0, "Ana");
    expect(out.map((s) => s.text)).toEqual([
      "Ana: Hello there",
      "Ana: hello again",
      "Ana: Goodbye",
    ]);
  });

  it("clamps a range that runs past the end", () => {
    const out = setSpeakerRange(SAMPLE, 1, 99, "Ana");
    expect(out[0]?.text).toBe("Hello there");
    expect(out[2]?.text).toBe("Ana: Goodbye");
  });
});

describe("timing", () => {
  it("shifts every segment", () => {
    const out = shiftTimes(SAMPLE, 1.5);
    expect(out.map((s) => [s.start, s.end])).toEqual([
      [1.5, 3.5],
      [3.5, 5.5],
      [5.5, 7.5],
    ]);
  });

  it("clamps a negative shift at zero rather than reordering the track", () => {
    const out = shiftTimes(SAMPLE, -10);
    expect(out.every((s) => s.start >= 0 && s.end >= 0)).toBe(true);
    expect(out[0]).toEqual({ start: 0, end: 0, text: "Hello there" });
  });

  it("returns the same reference for a zero shift", () => {
    expect(shiftTimes(SAMPLE, 0)).toBe(SAMPLE);
  });

  it("keeps start before end when times are set backwards", () => {
    const out = setSegmentTimes(SAMPLE, 0, 9, 3);
    expect(out[0]?.start).toBe(3);
    expect(out[0]?.end).toBe(9);
  });
});

describe("structure", () => {
  it("edits one segment's text", () => {
    expect(setSegmentText(SAMPLE, 1, "new")[1]?.text).toBe("new");
  });

  it("ignores an out-of-range index everywhere", () => {
    expect(setSegmentText(SAMPLE, 99, "x")).toBe(SAMPLE);
    expect(setSpeaker(SAMPLE, -1, "x")).toBe(SAMPLE);
    expect(removeSegment(SAMPLE, 99)).toBe(SAMPLE);
    expect(mergeWithPrevious(SAMPLE, 0)).toBe(SAMPLE);
  });

  it("removes a segment", () => {
    expect(removeSegment(SAMPLE, 1).map((s) => s.text)).toEqual([
      "Hello there",
      "Goodbye",
    ]);
  });

  it("merges a segment into the previous one, spanning both", () => {
    const out = mergeWithPrevious(SAMPLE, 1);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      start: 0,
      end: 4,
      text: "Hello there hello again",
    });
  });
});

describe("segmentsEqual", () => {
  it("is true for identical content and false for any difference", () => {
    expect(segmentsEqual(SAMPLE, [...SAMPLE])).toBe(true);
    expect(segmentsEqual(SAMPLE, SAMPLE.slice(1))).toBe(false);
    expect(segmentsEqual(SAMPLE, setSegmentText(SAMPLE, 0, "x"))).toBe(false);
    expect(segmentsEqual(SAMPLE, shiftTimes(SAMPLE, 1))).toBe(false);
  });
});
