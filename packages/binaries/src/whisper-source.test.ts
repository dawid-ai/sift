import { describe, expect, it } from "vitest";
import {
  resolveWhisperBinary,
  WHISPER_MODEL,
  WHISPER_VERSION,
} from "./whisper-source";

const HEX64 = /^[0-9a-f]{64}$/;

describe("resolveWhisperBinary", () => {
  it("windows (x64 and arm64) use the x64 zip and whisper-cli.exe", () => {
    for (const p of ["win-x64", "win-arm64"] as const) {
      const r = resolveWhisperBinary(p);
      expect(r.kind).toBe("archive");
      if (r.kind !== "archive") throw new Error("unreachable");
      expect(r.assetUrl).toContain(`/${WHISPER_VERSION}/whisper-bin-x64.zip`);
      expect(r.binaryName).toBe("whisper-cli.exe");
      expect(r.sha256).toMatch(HEX64);
    }
  });

  it("linux resolves per-arch tarballs and the bare cli name", () => {
    const x = resolveWhisperBinary("linux-x64");
    const a = resolveWhisperBinary("linux-arm64");
    if (x.kind !== "archive" || a.kind !== "archive")
      throw new Error("unreachable");
    expect(x.assetUrl).toContain("whisper-bin-ubuntu-x64.tar.gz");
    expect(a.assetUrl).toContain("whisper-bin-ubuntu-arm64.tar.gz");
    expect(x.binaryName).toBe("whisper-cli");
    expect(x.sha256).toMatch(HEX64);
    expect(a.sha256).toMatch(HEX64);
  });

  it("macOS signals Homebrew (no upstream CLI)", () => {
    expect(resolveWhisperBinary("mac-x64").kind).toBe("homebrew");
    expect(resolveWhisperBinary("mac-arm64").kind).toBe("homebrew");
  });

  it("model manifest is well-formed", () => {
    expect(WHISPER_MODEL.name).toBe("ggml-small.bin");
    expect(WHISPER_MODEL.url).toContain("ggml-small.bin");
    expect(WHISPER_MODEL.sha256).toMatch(HEX64);
    expect(WHISPER_MODEL.sizeBytes).toBeGreaterThan(400_000_000);
  });
});
