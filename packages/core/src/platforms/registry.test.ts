import { describe, expect, it } from "vitest";
import { TESTED_PLATFORMS } from "./tiers";
import { listTestedPlatforms, resolvePlatform } from "./registry";

describe("resolvePlatform", () => {
  it("resolves a tested platform case-insensitively", () => {
    expect(resolvePlatform("Youtube")).toEqual({
      id: "youtube",
      label: "YouTube",
      tier: "tested",
    });
  });

  it("resolves an unrecognized-but-present extractor key as supported", () => {
    expect(resolvePlatform("SomeRandomSite")).toEqual({
      id: "somerandomsite",
      label: "SomeRandomSite",
      tier: "supported",
    });
  });

  it("resolves null, empty, and whitespace-only keys as unknown", () => {
    expect(resolvePlatform(null)).toEqual({
      id: "unknown",
      label: "Unknown",
      tier: "unknown",
    });
    expect(resolvePlatform(undefined)).toEqual({
      id: "unknown",
      label: "Unknown",
      tier: "unknown",
    });
    expect(resolvePlatform("")).toEqual({
      id: "unknown",
      label: "Unknown",
      tier: "unknown",
    });
    expect(resolvePlatform("  ")).toEqual({
      id: "unknown",
      label: "Unknown",
      tier: "unknown",
    });
  });
});

describe("listTestedPlatforms", () => {
  it("returns one PlatformInfo per TESTED_PLATFORMS entry, all tier tested", () => {
    const list = listTestedPlatforms();
    expect(list.length).toBe(Object.keys(TESTED_PLATFORMS).length);
    for (const entry of list) {
      expect(entry.tier).toBe("tested");
    }
  });
});
