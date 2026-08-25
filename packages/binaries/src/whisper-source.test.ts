import { describe, expect, it } from "vitest";
import {
  isWhisperModelName,
  resolveWhisperBinary,
  resolveWhisperModel,
  WHISPER_MODEL,
  WHISPER_MODELS,
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

describe("resolveWhisperModel", () => {
  const listing = [
    {
      path: "ggml-large-v3-turbo.bin",
      lfs: { oid: "a".repeat(64), size: 1_600_000_000 },
    },
    { path: "README.md", size: 100 },
    { path: "ggml-nohash.bin", size: 5 },
  ];
  const okFetch = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => listing,
    }) as unknown as Response) as unknown as typeof fetch;

  it("uses the pinned hash without a network call for the shipped model", async () => {
    const never = (() => {
      throw new Error("should not fetch");
    }) as unknown as typeof fetch;
    const manifest = await resolveWhisperModel("ggml-small.bin", never);
    expect(manifest.sha256).toBe(WHISPER_MODEL.sha256);
    expect(manifest.url).toContain("ggml-small.bin");
  });

  it("reads an unpinned model's hash from the LFS oid the source publishes", async () => {
    const manifest = await resolveWhisperModel(
      "ggml-large-v3-turbo.bin",
      okFetch,
    );
    expect(manifest.sha256).toBe("a".repeat(64));
    expect(manifest.sizeBytes).toBe(1_600_000_000);
  });

  it("refuses a model the source publishes no checksum for", async () => {
    const withEntry = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => [{ path: "ggml-tiny.bin", size: 5 }],
      }) as unknown as Response) as unknown as typeof fetch;
    await expect(
      resolveWhisperModel("ggml-tiny.bin", withEntry),
    ).rejects.toThrow(/no checksum/);
  });

  it("refuses an unknown model name", async () => {
    await expect(resolveWhisperModel("ggml-evil.bin", okFetch)).rejects.toThrow(
      /Unknown Whisper model/,
    );
  });

  it("reports a failed metadata request instead of downloading unverified", async () => {
    const failing = (async () =>
      ({
        ok: false,
        status: 503,
      }) as unknown as Response) as unknown as typeof fetch;
    await expect(resolveWhisperModel("ggml-tiny.bin", failing)).rejects.toThrow(
      /503/,
    );
  });

  it("offers only multilingual models — no .en variants", () => {
    expect(WHISPER_MODELS.every((m) => !m.name.includes(".en"))).toBe(true);
    expect(isWhisperModelName("ggml-small.bin")).toBe(true);
    expect(isWhisperModelName("../../etc/passwd")).toBe(false);
  });
});
