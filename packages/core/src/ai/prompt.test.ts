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
