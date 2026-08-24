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

/** The default model: multilingual small (~466 MB). */
export const WHISPER_MODEL: WhisperModelManifest = {
  name: "ggml-small.bin",
  url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
  sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
  sizeBytes: 487_601_967,
};

const HF_REPO = "ggerganov/whisper.cpp";
const HF_TREE_API = `https://huggingface.co/api/models/${HF_REPO}/tree/main`;

/** One selectable model. Every entry is multilingual — the `.en` variants are excluded
 * precisely because they cannot transcribe anything but English. */
export interface WhisperModelChoice {
  name: string;
  label: string;
  /** Approximate on-disk size, for the picker. The exact size comes from the download. */
  approxBytes: number;
  /** Pinned hash where one has been verified; null means resolve it from the source. */
  sha256: string | null;
}

/**
 * Models offered in Settings, smallest first.
 *
 * Only `small` carries a pinned hash — it is the one that shipped and was verified by hand.
 * The rest resolve their hash from Hugging Face's own metadata at install time (see
 * `resolveWhisperModel`), which is the same rule the yt-dlp and ffmpeg downloads follow:
 * the checksum comes from the source, never computed from the bytes we just fetched.
 */
export const WHISPER_MODELS: WhisperModelChoice[] = [
  {
    name: "ggml-tiny.bin",
    label: "Tiny — fastest, least accurate",
    approxBytes: 77_700_000,
    sha256: null,
  },
  {
    name: "ggml-base.bin",
    label: "Base — fast",
    approxBytes: 148_000_000,
    sha256: null,
  },
  {
    name: "ggml-small.bin",
    label: "Small — balanced (default)",
    approxBytes: 487_601_967,
    sha256: WHISPER_MODEL.sha256,
  },
  {
    name: "ggml-medium.bin",
    label: "Medium — slower, better on accents",
    approxBytes: 1_530_000_000,
    sha256: null,
  },
  {
    name: "ggml-large-v3-turbo.bin",
    label: "Large v3 turbo — best quality",
    approxBytes: 1_620_000_000,
    sha256: null,
  },
];

export function isWhisperModelName(name: string): boolean {
  return WHISPER_MODELS.some((m) => m.name === name);
}

/** Shape of the one entry we read out of Hugging Face's tree listing. */
interface HfTreeEntry {
  path?: unknown;
  size?: unknown;
  lfs?: { oid?: unknown; size?: unknown } | null;
}

/**
 * Resolves a model name to a manifest with a concrete sha256.
 *
 * For anything without a pinned hash, the hash is read from Hugging Face's tree API: every
 * model file is stored in git-lfs, and an LFS object's `oid` **is** its sha256. That makes
 * this a checksum published by the source rather than one derived from the download, which
 * is the whole point of verifying at all.
 */
export async function resolveWhisperModel(
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WhisperModelManifest> {
  const choice = WHISPER_MODELS.find((m) => m.name === name);
  if (!choice) throw new Error(`Unknown Whisper model: ${name}`);
  const url = `https://huggingface.co/${HF_REPO}/resolve/main/${choice.name}`;
  if (choice.sha256)
    return {
      name: choice.name,
      url,
      sha256: choice.sha256,
      sizeBytes: choice.approxBytes,
    };

  const response = await fetchImpl(HF_TREE_API);
  if (!response.ok)
    throw new Error(
      `Could not read the model checksum from Hugging Face (HTTP ${response.status}). Try again, or pick the Small model, whose checksum ships with the app.`,
    );
  const listing: unknown = await response.json();
  if (!Array.isArray(listing))
    throw new Error("Hugging Face returned an unexpected model listing.");
  const entry = (listing as HfTreeEntry[]).find(
    (e) => typeof e.path === "string" && e.path === choice.name,
  );
  const oid = entry?.lfs?.oid;
  if (typeof oid !== "string" || !/^[0-9a-f]{64}$/.test(oid))
    throw new Error(
      `Hugging Face published no checksum for ${choice.name}, so it cannot be verified. Pick another model.`,
    );
  const size = entry?.lfs?.size ?? entry?.size;
  return {
    name: choice.name,
    url,
    sha256: oid,
    sizeBytes: typeof size === "number" ? size : choice.approxBytes,
  };
}
