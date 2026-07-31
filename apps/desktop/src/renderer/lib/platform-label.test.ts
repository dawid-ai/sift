import { describe, it, expect } from "vitest";
import { platformLabel } from "./platform-label";

describe("platformLabel", () => {
  it("maps known platform ids to friendly names", () => {
    expect(platformLabel("youtube")).toBe("YouTube");
    expect(platformLabel("twitter")).toBe("X");
    expect(platformLabel("x")).toBe("X");
  });
  it("is case-insensitive on the id", () => {
    expect(platformLabel("YouTube")).toBe("YouTube");
  });
  it("Title-cases unknown platforms", () => {
    expect(platformLabel("bilibili")).toBe("Bilibili");
  });
  it("handles an empty id", () => {
    expect(platformLabel("")).toBe("");
  });
});
