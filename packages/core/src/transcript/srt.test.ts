import { describe, expect, it } from "vitest";
import { segmentsToSrt } from "./srt";

describe("segmentsToSrt", () => {
  it("numbers cues from 1 and formats HH:MM:SS,mmm", () => {
    expect(
      segmentsToSrt([
        { start: 0, end: 2.5, text: "Hello there" },
        { start: 2.5, end: 4, text: "Second line" },
      ]),
    ).toBe(
      "1\n00:00:00,000 --> 00:00:02,500\nHello there\n\n" +
        "2\n00:00:02,500 --> 00:00:04,000\nSecond line\n",
    );
  });

  it("handles hours and fractional milliseconds", () => {
    expect(segmentsToSrt([{ start: 3723.456, end: 3725, text: "Late" }])).toBe(
      "1\n01:02:03,456 --> 01:02:05,000\nLate\n",
    );
  });

  it("skips blank segments and does not gap the numbering", () => {
    expect(
      segmentsToSrt([
        { start: 0, end: 1, text: "One" },
        { start: 1, end: 2, text: "   " },
        { start: 2, end: 3, text: "Two" },
      ]),
    ).toBe(
      "1\n00:00:00,000 --> 00:00:01,000\nOne\n\n2\n00:00:02,000 --> 00:00:03,000\nTwo\n",
    );
  });

  it("gives a zero-or-negative-length cue a one-second duration so players keep it", () => {
    expect(segmentsToSrt([{ start: 5, end: 5, text: "Instant" }])).toBe(
      "1\n00:00:05,000 --> 00:00:06,000\nInstant\n",
    );
  });

  it("returns an empty string when there is nothing to write", () => {
    expect(segmentsToSrt([])).toBe("");
  });
});
