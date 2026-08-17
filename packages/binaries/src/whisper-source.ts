import type { Platform } from "./platform";

/** whisper.cpp release we pin to. Upstream ships NO checksums file, so we hard-code a
 * sha256 computed once (see the plan's Task 1 Step 1). Bump = new tag + recomputed shas. */
export const WHISPER_VERSION = "v1.9.1";

const RELEASE_BASE = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_VERSION}`;

export type WhisperBinarySource =
  | {
      kind: "archive";
      assetUrl: string;
      sha256: string;
      version: string;
      binaryName: string;
    }
  | { kind: "homebrew" };

// Per-platform archive filename + its pinned sha256. Windows (x64 and arm64) both use the
// x64 build. macOS is intentionally absent — upstream publishes only an xcframework, no CLI.
const ARCHIVE: Partial<Record<Platform, { name: string; sha256: string }>> = {
  "win-x64": {
    name: "whisper-bin-x64.zip",
    sha256: "7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539",
  },
  "win-arm64": {
    name: "whisper-bin-x64.zip",
    sha256: "7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539",
  },
  "linux-x64": {
    name: "whisper-bin-ubuntu-x64.tar.gz",
    sha256: "f3bf3b4369a99b54665b0f19b88483b30de27f25963b0414235dea03198515c5",
  },
  "linux-arm64": {
    name: "whisper-bin-ubuntu-arm64.tar.gz",
    sha256: "e0b66cd551ff6f2a28fabe3c6e89691eea037bb76833493abb9a71ca788994b3",
  },
};

export function resolveWhisperBinary(p: Platform): WhisperBinarySource {
  const entry = ARCHIVE[p];
  if (!entry) return { kind: "homebrew" }; // mac-x64 / mac-arm64
  return {
    kind: "archive",
    assetUrl: `${RELEASE_BASE}/${entry.name}`,
    sha256: entry.sha256,
    version: WHISPER_VERSION,
    binaryName: p.startsWith("win") ? "whisper-cli.exe" : "whisper-cli",
  };
}

export interface WhisperModelManifest {
  name: string;
  url: string;
  sha256: string;
  sizeBytes: number;
}

/** The single bundled model: multilingual small (~466 MB). One-line swap to large-v3-turbo later. */
export const WHISPER_MODEL: WhisperModelManifest = {
  name: "ggml-small.bin",
  url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
  sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
  sizeBytes: 487_601_967,
};
