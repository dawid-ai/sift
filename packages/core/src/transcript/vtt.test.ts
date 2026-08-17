import { describe, expect, it } from "vitest";
import { parseVtt, segmentsToText } from "./vtt";

const SAMPLE = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world

00:00:04.000 --> 00:00:07.500
Second <c>line</c> here
`;

describe("parseVtt", () => {
  it("parses cues into {start,end,text} seconds, stripping tags", () => {
    const segs = parseVtt(SAMPLE);
    expect(segs).toEqual([
      { start: 1, end: 4, text: "Hello world" },
      { start: 4, end: 7.5, text: "Second line here" },
    ]);
  });
  it("handles HH:MM:SS.mmm and cue-setting suffixes, ignores NOTE/headers", () => {
    const vtt = `WEBVTT
Kind: captions

NOTE ignore me

01:02:03.250 --> 01:02:05.000 align:start position:0%
Deep timestamp`;
    expect(parseVtt(vtt)).toEqual([
      { start: 3723.25, end: 3725, text: "Deep timestamp" },
    ]);
  });
  it("collapses consecutive duplicate cue text (YouTube rolling auto-subs)", () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:01.000
foo

00:00:01.000 --> 00:00:02.000
foo

00:00:02.000 --> 00:00:03.000
bar`;
    expect(parseVtt(vtt).map((s) => s.text)).toEqual(["foo", "bar"]);
  });
  it("returns [] for empty/headerless input", () => {
    expect(parseVtt("WEBVTT\n")).toEqual([]);
    expect(parseVtt("")).toEqual([]);
  });
});

describe("segmentsToText", () => {
  it("joins segment text with newlines", () => {
    expect(
      segmentsToText([
        { start: 0, end: 1, text: "a" },
        { start: 1, end: 2, text: "b" },
      ]),
    ).toBe("a\nb");
  });
});
