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
});

describe("SUMMARY_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof SUMMARY_SYSTEM_PROMPT).toBe("string");
    expect(SUMMARY_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });
});
