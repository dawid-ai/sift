import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { copyFile, mkdtemp, rename, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { promisify } from "node:util";
import type { AssetRow, SiftDatabase } from "@sift/db";
import { getAsset, touchAssetChecked, upsertAsset } from "@sift/db";
import type { BinarySource, Platform } from "@sift/binaries";
import { downloadAndVerify } from "@sift/binaries";
import type {
  BinaryKind,
  BinaryProgress,
  BinaryStatus,
} from "@sift/ipc-contract";
import { resolveAssetPath } from "../asset-path";

// Note: deliberately does NOT import `../paths` (which imports `electron`) — this
// service must stay loadable under plain Node for its Vitest suite. `mkdirSync` is
// used directly instead of `paths.ts`'s `ensureDir` helper.

export type { BinaryProgress, BinaryStatus };

const execFileAsync = promisify(execFile);

/** Matches archive assets (BtbN ffmpeg releases) that must be extracted after download. */
const ARCHIVE_RE = /\.(zip|tar\.xz|tar\.gz)$/i;

export interface BinariesServiceOpts {
  db: SiftDatabase;
  binariesDir: string;
  sources: Record<BinaryKind, BinarySource>;
  platform: Platform;
  /** Injectable for tests; defaults to the ambient `fetch` inside `downloadAndVerify`/sources. */
  fetchImpl?: typeof fetch;
}

const KINDS: BinaryKind[] = ["ytdlp", "ffmpeg", "deno"];

function statusFromAsset(
  kind: BinaryKind,
  row: AssetRow | undefined,
  binariesDir: string,
): BinaryStatus {
  return {
    kind,
    installed: row !== undefined,
    installedVersion: row?.version ?? null,
    latestVersion: null,
    updateAvailable: false,
    path: row ? resolveAssetPath(binariesDir, row.path) : null,
  };
}

/**
 * Recursively searches `dir` for a file whose basename equals `name`.
 * Used to locate the executable inside an extracted archive tree.
 */
function findFileRecursive(dir: string, name: string): string | null {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      const found = findFileRecursive(full, name);
      if (found) return found;
    } else if (entry === name) {
      return full;
    }
  }
  return null;
}

export class BinariesService {
  constructor(private readonly opts: BinariesServiceOpts) {}

  /** Reads current install status for both managed binaries. No network calls. */
  async list(): Promise<BinaryStatus[]> {
    return KINDS.map((kind) =>
      statusFromAsset(
        kind,
        getAsset(this.opts.db, kind),
        this.opts.binariesDir,
      ),
    );
  }

  /** Resolves the latest upstream release and compares it against what's installed. */
  async check(kind: BinaryKind): Promise<BinaryStatus> {
    const source = this.opts.sources[kind];
    const latest = await source.resolveLatest(
      this.opts.platform,
      this.opts.fetchImpl,
    );
    const row = getAsset(this.opts.db, kind);
    if (row) {
      touchAssetChecked(this.opts.db, kind, Date.now());
    }
    return {
      kind,
      installed: row !== undefined,
      installedVersion: row?.version ?? null,
      latestVersion: latest.version,
      updateAvailable: row !== undefined && row.version !== latest.version,
      path: row ? resolveAssetPath(this.opts.binariesDir, row.path) : null,
    };
  }

  /** Downloads, verifies (sha256), extracts if needed, and installs the latest release. */
  async install(
    kind: BinaryKind,
    onProgress?: (p: BinaryProgress) => void,
  ): Promise<BinaryStatus> {
    const { db, binariesDir, sources, platform, fetchImpl } = this.opts;
    const source = sources[kind];
    const release = await source.resolveLatest(platform, fetchImpl);

    mkdirSync(binariesDir, { recursive: true });

    const finalPath = join(binariesDir, release.binaryName);
    const isArchive = ARCHIVE_RE.test(release.assetUrl);

    if (isArchive) {
      const archivePath = join(binariesDir, basename(release.assetUrl));
      await downloadAndVerify({
        url: release.assetUrl,
        destPath: archivePath,
        expectedSha256: release.sha256,
        onProgress: (p) => onProgress?.({ kind, ...p }),
        fetchImpl,
      });
      await this.extractBinary(archivePath, release.binaryName, finalPath);
    } else {
      await downloadAndVerify({
        url: release.assetUrl,
        destPath: finalPath,
        expectedSha256: release.sha256,
        onProgress: (p) => onProgress?.({ kind, ...p }),
        fetchImpl,
      });
    }

    const row = upsertAsset(db, {
      kind,
      name: release.binaryName,
      version: release.version,
      path: relative(binariesDir, finalPath),
      sha256: release.sha256,
      installed_at: Date.now(),
      last_checked: Date.now(),
    });

    return statusFromAsset(kind, row, binariesDir);
  }

  /**
   * Extracts `binaryName` out of `archivePath` (a .zip/.tar.xz/.tar.gz) into `destPath`,
   * then deletes the archive. Best-effort: relies on the system `tar` (present on
   * Win10 1803+/macOS/Linux) which handles zip and tar variants via libarchive/bsdtar
   * on Windows/macOS, and tar.gz/tar.xz on Linux.
   */
  private async extractBinary(
    archivePath: string,
    binaryName: string,
    destPath: string,
  ): Promise<void> {
    const extractDir = await mkdtemp(join(tmpdir(), "sift-extract-"));
    try {
      await execFileAsync("tar", ["-xf", archivePath, "-C", extractDir]);
      const found = findFileRecursive(extractDir, binaryName);
      if (!found) {
        throw new Error(
          `Could not locate "${binaryName}" inside ${archivePath}`,
        );
      }
      try {
        await rename(found, destPath);
      } catch (err) {
        // `found` (OS temp dir) and `destPath` (userData/binariesDir) can be on
        // different volumes, which makes rename() fail with EXDEV. Fall back to a
        // copy + delete in that case.
        if ((err as NodeJS.ErrnoException).code === "EXDEV") {
          await copyFile(found, destPath);
          await unlink(found);
        } else {
          throw err;
        }
      }
    } finally {
      await rm(extractDir, { recursive: true, force: true });
      if (existsSync(archivePath)) {
        await rm(archivePath, { force: true });
      }
    }
  }
}
