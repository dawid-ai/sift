import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import type {
  Platform,
  WhisperBinarySource,
  WhisperModelManifest,
} from "@sift/binaries";
import {
  downloadAndVerify,
  resolveWhisperBinary,
  WHISPER_MODEL,
} from "@sift/binaries";
import type { SiftDatabase } from "@sift/db";
import { getAsset, upsertAsset } from "@sift/db";
import { resolveAssetPath } from "../asset-path";

// Note: deliberately does NOT import `../paths` (electron) — Node-loadable for Vitest.

const execFileAsync = promisify(execFile);

export interface WhisperStatus {
  binaryInstalled: boolean;
  binaryPath: string | null;
  modelInstalled: boolean;
  modelPath: string | null;
}

export interface WhisperProgress {
  stage: "binary" | "model";
  received: number;
  total: number | null;
}

export interface WhisperSetupOpts {
  db: SiftDatabase;
  whisperDir: string;
  modelsDir: string;
  platform: Platform;
  fetchImpl?: typeof fetch;
  /** Extract the whole archive into destDir (keeps sibling shared libs). Default: system `tar`. */
  extract?: (archivePath: string, destDir: string) => Promise<void>;
  /** Locate a Homebrew whisper-cli on macOS. Default: known brew paths. */
  findHomebrewCli?: () => string | null;
  /** Test seams (default to the pinned resolvers). */
  resolveBinary?: (p: Platform) => WhisperBinarySource;
  model?: WhisperModelManifest;
  /** Resolves the selected model's manifest, including a checksum from the source. Takes
   * precedence over `model` when set. */
  resolveModel?: () => Promise<WhisperModelManifest>;
}

// known Homebrew locations only (covers Apple-silicon + Intel brew prefixes);
// a full PATH scan is upgrade path if a user's brew lives elsewhere.
const BREW_CLI_PATHS = [
  "/opt/homebrew/bin/whisper-cli",
  "/usr/local/bin/whisper-cli",
];

function defaultFindHomebrewCli(): string | null {
  return BREW_CLI_PATHS.find((p) => existsSync(p)) ?? null;
}

async function defaultExtract(
  archivePath: string,
  destDir: string,
): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  // system tar handles zip (libarchive/bsdtar on Win/mac) + tar.gz/tar.xz.
  await execFileAsync("tar", ["-xf", archivePath, "-C", destDir]);
}

function findFileRecursive(dir: string, name: string): string | null {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const found = findFileRecursive(full, name);
      if (found) return found;
    } else if (entry === name) {
      return full;
    }
  }
  return null;
}

export class WhisperSetupService {
  constructor(private readonly opts: WhisperSetupOpts) {}

  /** Synchronous manifest for path/status use. Resolution that needs the network happens
   * in `install`, which is the only place a checksum is actually required. */
  private modelManifest(): WhisperModelManifest {
    return this.opts.model ?? WHISPER_MODEL;
  }

  private modelPath(): string {
    return join(this.opts.modelsDir, this.modelManifest().name);
  }

  async status(): Promise<WhisperStatus> {
    const row = getAsset(this.opts.db, "whisper");
    const base = dirname(this.opts.whisperDir);
    const binaryPathAbs = row ? resolveAssetPath(base, row.path) : null;
    const binaryInstalled = binaryPathAbs !== null && existsSync(binaryPathAbs);
    const modelPath = this.modelPath();
    const modelInstalled = existsSync(modelPath);
    return {
      binaryInstalled,
      binaryPath: binaryInstalled ? binaryPathAbs : null,
      modelInstalled,
      modelPath: modelInstalled ? modelPath : null,
    };
  }

  async install(
    onProgress?: (p: WhisperProgress) => void,
  ): Promise<WhisperStatus> {
    const { db, whisperDir, modelsDir, platform, fetchImpl } = this.opts;
    const resolve = this.opts.resolveBinary ?? resolveWhisperBinary;
    const source = resolve(platform);

    // 1) Binary
    if (source.kind === "homebrew") {
      const cli = (this.opts.findHomebrewCli ?? defaultFindHomebrewCli)();
      if (!cli) {
        throw new Error(
          "whisper.cpp isn't available for macOS from the app. Install it with Homebrew: `brew install whisper-cpp`, then reinstall here.",
        );
      }
      upsertAsset(db, {
        kind: "whisper",
        name: "whisper-cli",
        version: "homebrew",
        path: cli,
        sha256: "homebrew",
        installed_at: Date.now(),
        last_checked: Date.now(),
      });
    } else {
      mkdirSync(whisperDir, { recursive: true });
      const archivePath = join(whisperDir, basename(source.assetUrl));
      await downloadAndVerify({
        url: source.assetUrl,
        destPath: archivePath,
        expectedSha256: source.sha256,
        onProgress: (p) => onProgress?.({ stage: "binary", ...p }),
        fetchImpl,
      });
      const extract = this.opts.extract ?? defaultExtract;
      await extract(archivePath, whisperDir);
      await rm(archivePath, { force: true });
      const cli = findFileRecursive(whisperDir, source.binaryName);
      if (!cli) {
        throw new Error(
          `Could not find ${source.binaryName} in the extracted whisper archive`,
        );
      }
      upsertAsset(db, {
        kind: "whisper",
        name: source.binaryName,
        version: source.version,
        path: relative(dirname(whisperDir), cli),
        sha256: source.sha256,
        installed_at: Date.now(),
        last_checked: Date.now(),
      });
    }

    // 2) Model (presence-on-disk; skip if already there)
    // `resolveModel` is what makes a model other than the shipped one installable: it fetches
    // the checksum the source publishes, so nothing is ever downloaded unverified.
    const manifest = this.opts.resolveModel
      ? await this.opts.resolveModel()
      : this.modelManifest();
    mkdirSync(modelsDir, { recursive: true });
    // The resolved manifest's name, not `modelPath()` — a switch to another model must land
    // under that model's filename, not overwrite the previous one.
    const modelPath = join(modelsDir, manifest.name);
    if (!existsSync(modelPath)) {
      await downloadAndVerify({
        url: manifest.url,
        destPath: modelPath,
        expectedSha256: manifest.sha256,
        onProgress: (p) => onProgress?.({ stage: "model", ...p }),
        fetchImpl,
      });
    }

    return this.status();
  }
}
