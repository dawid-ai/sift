import type { Platform } from "./platform";
import { denoSource } from "./deno-source";

export interface ResolvedRelease {
  version: string;
  assetUrl: string;
  sha256: string;
  binaryName: string;
}

export interface BinarySource {
  kind: "ytdlp" | "ffmpeg" | "deno";
  resolveLatest(p: Platform, fetchImpl?: typeof fetch): Promise<ResolvedRelease>;
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  published_at: string;
  assets: GithubAsset[];
}

const GITHUB_HEADERS = {
  "User-Agent": "sift-app",
  Accept: "application/vnd.github+json",
};

async function fetchLatestRelease(
  repo: string,
  doFetch: typeof fetch,
): Promise<GithubRelease> {
  const res = await doFetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: GITHUB_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch latest release for ${repo} (${res.status})`);
  }
  return (await res.json()) as GithubRelease;
}

function findAsset(release: GithubRelease, name: string): GithubAsset {
  const asset = release.assets.find((a) => a.name === name);
  if (!asset) {
    throw new Error(`Asset "${name}" not found in release ${release.tag_name}`);
  }
  return asset;
}

/** Parses `SHA2-256SUMS`-style bodies: lines of `<sha>  <name>`. */
function parseShaSumsFile(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [sha, ...rest] = trimmed.split(/\s+/);
    const name = rest.join(" ");
    if (sha && name) map.set(name, sha);
  }
  return map;
}

const YTDLP_ASSET_NAME: Record<Platform, string> = {
  "win-x64": "yt-dlp.exe",
  "win-arm64": "yt-dlp.exe",
  "mac-x64": "yt-dlp_macos",
  "mac-arm64": "yt-dlp_macos",
  "linux-x64": "yt-dlp_linux",
  "linux-arm64": "yt-dlp_linux_aarch64",
};

export const ytdlpSource: BinarySource = {
  kind: "ytdlp",
  async resolveLatest(p, fetchImpl) {
    const doFetch = fetchImpl ?? fetch;
    const release = await fetchLatestRelease("yt-dlp/yt-dlp", doFetch);
    const binaryName = YTDLP_ASSET_NAME[p];
    const asset = findAsset(release, binaryName);
    const sumsAsset = findAsset(release, "SHA2-256SUMS");
    const sumsRes = await doFetch(sumsAsset.browser_download_url, { headers: GITHUB_HEADERS });
    if (!sumsRes.ok) {
      throw new Error(`Failed to fetch SHA2-256SUMS (${sumsRes.status})`);
    }
    const sumsText = await sumsRes.text();
    const sums = parseShaSumsFile(sumsText);
    const sha256 = sums.get(binaryName);
    if (!sha256) {
      throw new Error(`No sha256 entry found for "${binaryName}" in SHA2-256SUMS`);
    }
    return {
      version: release.tag_name,
      assetUrl: asset.browser_download_url,
      sha256,
      binaryName,
    };
  },
};

const FFMPEG_TARGET: Partial<Record<Platform, { slug: string; ext: string }>> = {
  "win-x64": { slug: "win64", ext: "zip" },
  "win-arm64": { slug: "winarm64", ext: "zip" },
  "linux-x64": { slug: "linux64", ext: "tar.xz" },
  "linux-arm64": { slug: "linuxarm64", ext: "tar.xz" },
};

/**
 * Highest release-branch archive (`ffmpeg-n8.1-latest-win64-gpl-8.1.zip`), or null if
 * BtbN publishes none for this platform.
 *
 * The `master-latest` archives BtbN also publishes are rebuilt from ffmpeg master every
 * day, so their only version identity is the release's `published_at` — which made every
 * daily update check report "update available" and re-download ~80 MB for no functional
 * gain. A release-branch build's version only moves when upstream cuts a new ffmpeg
 * release, which is what we actually want to follow.
 */
function pickReleaseBranchAsset(
  release: GithubRelease,
  slug: string,
  ext: string,
): { name: string; version: string } | null {
  const re = new RegExp(
    `^ffmpeg-n(\\d+)\\.(\\d+)-latest-${slug}-gpl-[\\d.]+\\.${ext.replace(/\./g, "\\.")}$`,
  );
  let best: { name: string; version: string; rank: number } | null = null;
  for (const asset of release.assets) {
    const m = re.exec(asset.name);
    if (!m) continue;
    const rank = Number(m[1]) * 1000 + Number(m[2]);
    if (!best || rank > best.rank) {
      best = { name: asset.name, version: `n${m[1]}.${m[2]}`, rank };
    }
  }
  return best;
}

function ffmpegBinaryName(p: Platform): string {
  return p.startsWith("win") ? "ffmpeg.exe" : "ffmpeg";
}

export const ffmpegSource: BinarySource = {
  kind: "ffmpeg",
  async resolveLatest(p, fetchImpl) {
    const doFetch = fetchImpl ?? fetch;
    const target = FFMPEG_TARGET[p];
    if (!target) {
      throw new Error(
        "ffmpeg auto-download is not available for macOS via BtbN; install ffmpeg separately",
      );
    }
    const release = await fetchLatestRelease("BtbN/FFmpeg-Builds", doFetch);
    // Fall back to the daily master build only if BtbN stops publishing release branches.
    const picked = pickReleaseBranchAsset(release, target.slug, target.ext) ?? {
      name: `ffmpeg-master-latest-${target.slug}-gpl.${target.ext}`,
      version: `build-${release.published_at.slice(0, 10)}`,
    };
    const archiveName = picked.name;
    const asset = findAsset(release, archiveName);
    // BtbN publishes a single `checksums.sha256` sums file (lines of `<sha>  <name>`),
    // not a per-asset `.sha256` sidecar.
    const sumsAsset = findAsset(release, "checksums.sha256");
    const sumsRes = await doFetch(sumsAsset.browser_download_url, { headers: GITHUB_HEADERS });
    if (!sumsRes.ok) {
      throw new Error(`Failed to fetch checksums.sha256 (${sumsRes.status})`);
    }
    const sums = parseShaSumsFile(await sumsRes.text());
    const sha256 = sums.get(archiveName);
    if (!sha256) {
      throw new Error(`No sha256 entry found for "${archiveName}" in checksums.sha256`);
    }
    return {
      version: picked.version,
      assetUrl: asset.browser_download_url,
      sha256,
      binaryName: ffmpegBinaryName(p),
    };
  },
};

export const SOURCES: Record<"ytdlp" | "ffmpeg" | "deno", BinarySource> = {
  ytdlp: ytdlpSource,
  ffmpeg: ffmpegSource,
  deno: denoSource,
};
