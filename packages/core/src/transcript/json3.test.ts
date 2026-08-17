import { describe, expect, it } from "vitest";
import { parseJson3 } from "./json3";

describe("parseJson3", () => {
  it("parses events into clean {start,end,text} with no rolling duplication", () => {
    const raw = JSON.stringify({
      events: [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: "hello" }, { utf8: " world" }],
        },
        {
          tStartMs: 1000,
          dDurationMs: 1000,
          segs: [{ utf8: "this is a test" }],
        },
      ],
    });
    expect(parseJson3(raw)).toEqual([
      { start: 0, end: 1, text: "hello world" },
      { start: 1, end: 2, text: "this is a test" },
    ]);
  });
  it("skips newline-only and empty events", () => {
    const raw = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 500, segs: [{ utf8: "\n" }] },
        { tStartMs: 500, segs: [] },
        { tStartMs: 600 }, // no segs
        { tStartMs: 700, dDurationMs: 300, segs: [{ utf8: "real" }] },
      ],
    });
    expect(parseJson3(raw)).toEqual([{ start: 0.7, end: 1, text: "real" }]);
  });
  it("collapses exact consecutive duplicate text", () => {
    const raw = JSON.stringify({
      events: [
        { tStartMs: 0, dDurationMs: 500, segs: [{ utf8: "same" }] },
        { tStartMs: 500, dDurationMs: 500, segs: [{ utf8: "same" }] },
        { tStartMs: 1000, dDurationMs: 500, segs: [{ utf8: "diff" }] },
      ],
    });
    expect(parseJson3(raw).map((s) => s.text)).toEqual(["same", "diff"]);
  });
  it("returns [] for malformed / empty json", () => {
    expect(parseJson3("not json")).toEqual([]);
    expect(parseJson3(JSON.stringify({}))).toEqual([]);
  });
});
