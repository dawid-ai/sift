import { describe, expect, it } from "vitest";
import {
  describeRule,
  EMPTY_RULE,
  evaluateRule,
  matchesRule,
  parseKeywords,
  type ChannelRule,
  type RuleCandidate,
} from "./rules";

const rule = (over: Partial<ChannelRule> = {}): ChannelRule => ({
  ...EMPTY_RULE,
  enabled: true,
  excludeShorts: false,
  ...over,
});

const video = (over: Partial<RuleCandidate> = {}): RuleCandidate => ({
  title: "A deep dive into caching",
  durationSec: 1800,
  viewCount: 10_000,
  isShort: false,
  ...over,
});

describe("evaluateRule", () => {
  it("matches an unconstrained enabled rule", () => {
    expect(evaluateRule(rule(), video())).toBeNull();
    expect(matchesRule(rule(), video())).toBe(true);
  });

  it("rejects everything while disabled", () => {
    expect(evaluateRule(rule({ enabled: false }), video())).toBe("disabled");
  });

  it("bounds duration inclusively", () => {
    const r = rule({ minDurationS: 600, maxDurationS: 3600 });
    expect(evaluateRule(r, video({ durationSec: 600 }))).toBeNull();
    expect(evaluateRule(r, video({ durationSec: 3600 }))).toBeNull();
    expect(evaluateRule(r, video({ durationSec: 599 }))).toBe("too-short");
    expect(evaluateRule(r, video({ durationSec: 3601 }))).toBe("too-long");
  });

  it("rejects an unknown duration rather than assuming it fits", () => {
    expect(
      evaluateRule(rule({ minDurationS: 60 }), video({ durationSec: null })),
    ).toBe("unknown-duration");
    // With no duration bound, an unknown duration is irrelevant.
    expect(evaluateRule(rule(), video({ durationSec: null }))).toBeNull();
  });

  it("rejects an unknown view count when a threshold is set", () => {
    expect(
      evaluateRule(rule({ minViews: 1000 }), video({ viewCount: null })),
    ).toBe("unknown-views");
    expect(evaluateRule(rule(), video({ viewCount: null }))).toBeNull();
  });

  it("bounds views inclusively", () => {
    const r = rule({ minViews: 10_000 });
    expect(evaluateRule(r, video({ viewCount: 10_000 }))).toBeNull();
    expect(evaluateRule(r, video({ viewCount: 9_999 }))).toBe("too-few-views");
  });

  it("matches any keyword, ignoring case", () => {
    const r = rule({ keywords: ["CACHING", "database"] });
    expect(evaluateRule(r, video())).toBeNull();
    expect(
      evaluateRule(r, video({ title: "Postgres DATABASE tips" })),
    ).toBeNull();
    expect(evaluateRule(r, video({ title: "Unrelated talk" }))).toBe(
      "no-keyword",
    );
  });

  it("skips Shorts only when asked", () => {
    expect(
      evaluateRule(rule({ excludeShorts: true }), video({ isShort: true })),
    ).toBe("short");
    expect(evaluateRule(rule(), video({ isShort: true }))).toBeNull();
  });

  it("applies every constraint together", () => {
    const r = rule({
      minDurationS: 600,
      minViews: 5000,
      keywords: ["caching"],
      excludeShorts: true,
    });
    expect(evaluateRule(r, video())).toBeNull();
    expect(evaluateRule(r, video({ viewCount: 100 }))).toBe("too-few-views");
    expect(evaluateRule(r, video({ title: "something else" }))).toBe(
      "no-keyword",
    );
  });
});

describe("parseKeywords", () => {
  it("trims and drops empties", () => {
    expect(parseKeywords(" rust , , go ,")).toEqual(["rust", "go"]);
    expect(parseKeywords("")).toEqual([]);
    expect(parseKeywords("   ")).toEqual([]);
  });
});

describe("describeRule", () => {
  it("says Off when disabled", () => {
    expect(describeRule(EMPTY_RULE)).toBe("Off");
  });

  it("says what an unconstrained rule will do", () => {
    expect(describeRule(rule())).toBe("Every new upload");
  });

  it("summarises the constraints that are set", () => {
    const text = describeRule(
      rule({
        minDurationS: 600,
        maxDurationS: 3600,
        minViews: 5000,
        keywords: ["rust"],
        excludeShorts: true,
      }),
    );
    expect(text).toContain("10–60 min");
    expect(text).toContain("5,000+ views");
    expect(text).toContain("matching rust");
    expect(text).toContain("no Shorts");
  });

  it("phrases a one-sided duration bound", () => {
    expect(describeRule(rule({ minDurationS: 1200 }))).toContain("over 20 min");
    expect(describeRule(rule({ maxDurationS: 300 }))).toContain("under 5 min");
  });
});
