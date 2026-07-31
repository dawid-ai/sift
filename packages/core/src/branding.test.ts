import { describe, expect, it } from "vitest";
import { branding } from "./branding";

describe("branding", () => {
  it("exposes a single source of truth for app identity", () => {
    expect(branding.appName).toBe("Sift");
    expect(branding.appId).toBe("com.sift.desktop");
    expect(branding.slug).toBe("sift");
  });
});
