import { describe, expect, it } from "vitest";
import { ytdlpSource, ffmpegSource, SOURCES } from "./sources";

const YTDLP_RELEASE = {
  tag_name: "2024.09.01",
  assets: [
    { name: "yt-dlp.exe", browser_download_url: "https://gh/yt-dlp.exe" },
    { name: "yt-dlp_macos", browser_download_url: "https://gh/yt-dlp_macos" },
    { name: "yt-dlp_linux", browser_download_url: "https://gh/yt-dlp_linux" },
    {
      name: "yt-dlp_linux_aarch64",
      browser_download_url: "https://gh/yt-dlp_linux_aarch64",
    },
    { name: "SHA2-256SUMS", browser_download_url: "https://gh/SHA2-256SUMS" },
  ],
};
const YTDLP_SUMS =
  "aaa111  yt-dlp.exe\nbbb222  yt-dlp_macos\nccc333  yt-dlp_linux\nddd444  yt-dlp_linux_aarch64\n";

function fakeYtdlpFetch(): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    expect(
      (init?.headers as Record<string, string> | undefined)?.["User-Agent"],
    ).toBe("sift-app");
    expect(
      (init?.headers as Record<string, string> | undefined)?.["Accept"],
    ).toBe("application/vnd.github+json");
    if (u.includes("releases/latest")) {
      return new Response(JSON.stringify(YTDLP_RELEASE), { status: 200 });
    }
    if (u.includes("SHA2-256SUMS")) {
      return new Response(YTDLP_SUMS, { status: 200 });
    }
    throw new Error(`unexpected url ${u}`);
  }) as unknown as typeof fetch;
}

describe("ytdlpSource.resolveLatest", () => {
  it("resolves the win-x64 asset with its sha256", async () => {
    const r = await ytdlpSource.resolveLatest("win-x64", fakeYtdlpFetch());
    expect(r.binaryName).toBe("yt-dlp.exe");
    expect(r.assetUrl).toBe("https://gh/yt-dlp.exe");
    expect(r.version).toBe("2024.09.01");
    expect(r.sha256).toBe("aaa111");
  });

  it("resolves the mac-arm64 asset with its sha256", async () => {
    const r = await ytdlpSource.resolveLatest("mac-arm64", fakeYtdlpFetch());
    expect(r.binaryName).toBe("yt-dlp_macos");
    expect(r.assetUrl).toBe("https://gh/yt-dlp_macos");
    expect(r.sha256).toBe("bbb222");
  });

  it("resolves the linux-arm64 asset with its sha256", async () => {
    const r = await ytdlpSource.resolveLatest("linux-arm64", fakeYtdlpFetch());
    expect(r.binaryName).toBe("yt-dlp_linux_aarch64");
    expect(r.assetUrl).toBe("https://gh/yt-dlp_linux_aarch64");
    expect(r.sha256).toBe("ddd444");
  });
});

const FFMPEG_RELEASE = {
  tag_name: "latest",
  published_at: "2024-09-01T12:49:00Z",
  assets: [
    {
      name: "ffmpeg-master-latest-win64-gpl.zip",
      browser_download_url: "https://gh/ffmpeg-win64-gpl.zip",
    },
    {
      name: "ffmpeg-master-latest-linux64-gpl.tar.xz",
      browser_download_url: "https://gh/ffmpeg-linux64-gpl.tar.xz",
    },
    // BtbN publishes a single sums file covering every archive, not per-asset sidecars.
    {
      name: "checksums.sha256",
      browser_download_url: "https://gh/checksums.sha256",
    },
  ],
};
// `checksums.sha256` body: one `<sha>  <name>` line per archive.
const FFMPEG_CHECKSUMS =
  "eee555  ffmpeg-master-latest-win64-gpl.zip\n" +
  "fff666  ffmpeg-master-latest-linux64-gpl.tar.xz\n";

function fakeFfmpegFetch(): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    expect(
      (init?.headers as Record<string, string> | undefined)?.["User-Agent"],
    ).toBe("sift-app");
    if (u.includes("releases/latest")) {
      return new Response(JSON.stringify(FFMPEG_RELEASE), { status: 200 });
    }
    if (u.includes("checksums.sha256")) {
      return new Response(FFMPEG_CHECKSUMS, { status: 200 });
    }
    throw new Error(`unexpected url ${u}`);
  }) as unknown as typeof fetch;
}

describe("ffmpegSource.resolveLatest", () => {
  it("resolves the win-x64 archive with its sha256 and inner binary name", async () => {
    const r = await ffmpegSource.resolveLatest("win-x64", fakeFfmpegFetch());
    expect(r.assetUrl).toBe("https://gh/ffmpeg-win64-gpl.zip");
    expect(r.version).toBe("build-2024-09-01");
    expect(r.sha256).toBe("eee555");
    expect(r.binaryName).toBe("ffmpeg.exe");
  });

  it("resolves the linux-x64 archive with its sha256 and inner binary name", async () => {
    const r = await ffmpegSource.resolveLatest("linux-x64", fakeFfmpegFetch());
    expect(r.assetUrl).toBe("https://gh/ffmpeg-linux64-gpl.tar.xz");
    expect(r.sha256).toBe("fff666");
    expect(r.binaryName).toBe("ffmpeg");
  });

  it("prefers the highest release-branch build over the daily master build", async () => {
    const release = {
      tag_name: "latest",
      published_at: "2024-09-01T12:49:00Z",
      assets: [
        ...FFMPEG_RELEASE.assets,
        {
          name: "ffmpeg-n7.1-latest-win64-gpl-7.1.zip",
          browser_download_url: "https://gh/n7.zip",
        },
        {
          name: "ffmpeg-n8.1-latest-win64-gpl-8.1.zip",
          browser_download_url: "https://gh/n8.zip",
        },
        // shared/lgpl variants must not win
        {
          name: "ffmpeg-n8.1-latest-win64-gpl-shared-8.1.zip",
          browser_download_url: "https://gh/x",
        },
        {
          name: "ffmpeg-n9.0-latest-win64-lgpl-9.0.zip",
          browser_download_url: "https://gh/x",
        },
      ],
    };
    const doFetch = (async (url: string | URL) => {
      const u = String(url);
      if (u.includes("releases/latest"))
        return new Response(JSON.stringify(release), { status: 200 });
      if (u.includes("checksums.sha256")) {
        return new Response("999zzz  ffmpeg-n8.1-latest-win64-gpl-8.1.zip\n", {
          status: 200,
        });
      }
      throw new Error(`unexpected url ${u}`);
    }) as unknown as typeof fetch;

    const r = await ffmpegSource.resolveLatest("win-x64", doFetch);
    expect(r.assetUrl).toBe("https://gh/n8.zip");
    expect(r.version).toBe("n8.1");
    expect(r.sha256).toBe("999zzz");
  });

  it("throws a clear error for macOS (BtbN does not publish mac builds)", async () => {
    await expect(
      ffmpegSource.resolveLatest("mac-arm64", fakeFfmpegFetch()),
    ).rejects.toThrow(/macOS/);
    await expect(
      ffmpegSource.resolveLatest("mac-x64", fakeFfmpegFetch()),
    ).rejects.toThrow(/ffmpeg auto-download is not available for macOS/);
  });
});

describe("SOURCES", () => {
  it("exposes both sources keyed by kind", () => {
    expect(SOURCES.ytdlp).toBe(ytdlpSource);
    expect(SOURCES.ffmpeg).toBe(ffmpegSource);
    expect(SOURCES.ytdlp.kind).toBe("ytdlp");
    expect(SOURCES.ffmpeg.kind).toBe("ffmpeg");
  });
});
