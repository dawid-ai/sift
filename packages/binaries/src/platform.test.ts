import { describe, expect, it } from "vitest";
import { currentPlatform } from "./platform";

describe("currentPlatform", () => {
  it("maps node platform/arch to a Platform key", () => {
    expect(currentPlatform({ platform: "win32", arch: "x64" })).toBe("win-x64");
    expect(currentPlatform({ platform: "darwin", arch: "arm64" })).toBe("mac-arm64");
    expect(currentPlatform({ platform: "linux", arch: "x64" })).toBe("linux-x64");
  });
  it("throws on an unsupported combo", () => {
    expect(() => currentPlatform({ platform: "sunos", arch: "mips" })).toThrow();
  });
});
