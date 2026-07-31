import { describe, it, expect } from "vitest";
import { resolveDeno, denoSource, DENO_VERSION } from "./deno-source";
import type { Platform } from "./platform";

const PLATFORMS: Platform[] = ["win-x64", "win-arm64", "mac-x64", "mac-arm64", "linux-x64", "linux-arm64"];

describe("resolveDeno", () => {
  it("resolves every platform with a pinned version, a github assetUrl, a 64-hex sha, and the right binary name", () => {
    for (const p of PLATFORMS) {
      const r = resolveDeno(p);
      expect(r.version).toBe(DENO_VERSION);
      expect(r.assetUrl).toContain(`/denoland/deno/releases/download/${DENO_VERSION}/`);
      expect(r.assetUrl.endsWith(".zip")).toBe(true);
      expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(r.binaryName).toBe(p.startsWith("win") ? "deno.exe" : "deno");
    }
  });

  it("uses the msvc asset for windows and the correct triple per platform", () => {
    expect(resolveDeno("mac-arm64").assetUrl).toContain("deno-aarch64-apple-darwin.zip");
    expect(resolveDeno("linux-x64").assetUrl).toContain("deno-x86_64-unknown-linux-gnu.zip");
    expect(resolveDeno("win-x64").assetUrl).toContain("deno-x86_64-pc-windows-msvc.zip");
  });
});

describe("denoSource", () => {
  it("resolveLatest returns the pin WITHOUT touching the network", async () => {
    const throwingFetch = (() => { throw new Error("network must not be used"); }) as unknown as typeof fetch;
    const r = await denoSource.resolveLatest("linux-x64", throwingFetch);
    expect(r.version).toBe(DENO_VERSION);
    expect(denoSource.kind).toBe("deno");
  });
});
