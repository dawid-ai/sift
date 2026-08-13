import { describe, expect, it } from "vitest";
import { assembleSummaryContent, SUMMARY_SYSTEM_PROMPT } from "./prompt";

describe("assembleSummaryContent", () => {
  it("joins promptBody and transcriptText with the transcript separator", () => {
    expect(assembleSummaryContent("Summarize this.", "hello world")).toBe(
      "Summarize this.\n\n----- TRANSCRIPT -----\nhello world",
    );
  });
  it("trims leading/trailing whitespace from both arguments", () => {
    expect(assembleSummaryContent("  Summarize this.  \n", "\n  hello world  ")).toBe(
      "Summarize this.\n\n----- TRANSCRIPT -----\nhello world",
    );
  });
  it("is unchanged when frames is empty or all-blank", () => {
    const base = "Summarize this.\n\n----- TRANSCRIPT -----\nhello world";
    expect(assembleSummaryContent("Summarize this.", "hello world", [])).toBe(base);
    expect(assembleSummaryContent("Summarize this.", "hello world", [{ tsMs: 0, text: "  " }])).toBe(base);
  });
  it("appends a timestamped slides section when frames carry text", () => {
    expect(
      assembleSummaryContent("Summarize this.", "hello world", [
        { tsMs: 12_000, text: "Q3 Revenue up 40%" },
        { tsMs: 3_723_000, text: "  Roadmap  " },
      ]),
    ).toBe(
      "Summarize this.\n\n----- TRANSCRIPT -----\nhello world\n\n" +
        "----- ON-SCREEN TEXT (SLIDES) -----\n[00:12] Q3 Revenue up 40%\n[1:02:03] Roadmap",
    );
  });
});

describe("SUMMARY_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof SUMMARY_SYSTEM_PROMPT).toBe("string");
    expect(SUMMARY_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });
});

describe("assembleSummaryContent with {{TIMESTAMPS}}", () => {
  const segments = [
    { start: 0, text: "Intro and hello" },
    { start: 72, text: "The first real point" },
    { start: 3723, text: "Wrapping up" },
  ];

  it("ignores segments when the prompt does not opt in", () => {
    expect(assembleSummaryContent("Summarize this.", "flat text", [], segments)).toBe(
      "Summarize this.\n\n----- TRANSCRIPT -----\nflat text",
    );
  });

  it("renders a timestamped transcript and strips the marker from the prompt", () => {
    expect(
      assembleSummaryContent("List chapters. {{TIMESTAMPS}}", "flat text", [], segments),
    ).toBe(
      "List chapters.\n\n----- TRANSCRIPT -----\n" +
        "[00:00] Intro and hello\n[01:12] The first real point\n[1:02:03] Wrapping up",
    );
  });

  it("falls back to the flat text when the transcript has no segments", () => {
    expect(assembleSummaryContent("List chapters. {{TIMESTAMPS}}", "flat text", [], [])).toBe(
      "List chapters.\n\n----- TRANSCRIPT -----\nflat text",
    );
  });

  it("still appends the slides section when timestamps are on", () => {
    expect(
      assembleSummaryContent(
        "List chapters. {{TIMESTAMPS}}",
        "flat text",
        [{ tsMs: 12_000, text: "Q3 Revenue" }],
        segments,
      ),
    ).toBe(
      "List chapters.\n\n----- TRANSCRIPT -----\n" +
        "[00:00] Intro and hello\n[01:12] The first real point\n[1:02:03] Wrapping up\n\n" +
        "----- ON-SCREEN TEXT (SLIDES) -----\n[00:12] Q3 Revenue",
    );
  });

  it("skips blank segments", () => {
    expect(
      assembleSummaryContent("Chapters {{TIMESTAMPS}}", "flat", [], [
        { start: 0, text: "Kept" },
        { start: 5, text: "   " },
      ]),
    ).toBe("Chapters\n\n----- TRANSCRIPT -----\n[00:00] Kept");
  });
});
