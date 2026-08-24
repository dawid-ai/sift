import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  statfsSync,
  statSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { dirname, join } from "node:path";
import {
  app,
  BrowserWindow,
  Menu,
  net,
  protocol,
  safeStorage,
  screen,
  session,
} from "electron";
import { autoUpdater } from "electron-updater";
import {
  AiRegistry,
  branding,
  LOCAL_PLATFORM_ID,
  LOCAL_TAG,
  TranscriptRegistry,
} from "@sift/core";
import type { AiProvider, TranscriptProvider } from "@sift/core";
import { openDatabase, runMigrations, type SiftDatabase } from "@sift/db";
import {
  currentPlatform,
  sha256File,
  SOURCES,
  type BinarySource,
} from "@sift/binaries";
import {
  IPC,
  type BinaryKind,
  type QueueConfig,
  type TranscriptMethod,
} from "@sift/ipc-contract";
import { KEYED_AI_PROVIDER_IDS } from "@sift/core";
import {
  backfillMediaChannelIds,
  backfillPlatformTag,
  downloadExistsByFilePath,
  frameExistsByImagePath,
  getAsset,
  mediaExistsByThumbnailPath,
  upsertAsset,
  type AssetKind,
} from "@sift/db";
import { normalizeAssetPaths, resolveAssetPath } from "./asset-path";
import { parseRange, mediaContentType } from "./media-range";
import { registerAppIpc } from "./ipc/app";
import { registerDiagnosticsIpc } from "./ipc/diagnostics";
import { registerUpdatesIpc } from "./ipc/updates";
import { registerOllamaIpc } from "./ipc/ollama";
import { registerDbIpc } from "./ipc/db";
import { registerBinariesIpc, registerBinaryUpdatesIpc } from "./ipc/binaries";
import { registerMetadataIpc } from "./ipc/metadata";
import { registerDownloadIpc } from "./ipc/download";
import { registerImportIpc } from "./ipc/import";
import { registerLibraryIpc } from "./ipc/library";
import { registerTagsIpc } from "./ipc/tags";
import { registerTranscriptIpc } from "./ipc/transcript";
import { registerSummarizeIpc } from "./ipc/summarize";
import { registerProfileIpc } from "./ipc/profile";
import { registerStorageIpc } from "./ipc/storage";
import { registerCollectionsIpc } from "./ipc/collections";
import { registerExportClipIpc } from "./ipc/export-clip";
import { ExportService } from "./services/export-service";
import { ClipService } from "./services/clip-service";
import { registerFramesIpc } from "./ipc/frames";
import { registerAiProvidersIpc } from "./ipc/ai-providers";
import { registerSettingsIpc } from "./ipc/settings";
import { registerAuthIpc } from "./ipc/auth";
import { registerQueueIpc } from "./ipc/queue";
import { registerChannelsIpc } from "./ipc/channels";
import { registerWhisperIpc } from "./ipc/whisper";
import { registerDownloadsIpc } from "./ipc/downloads";
import { createAuthManager, type ManagerCookie } from "./auth/auth-manager";
import { openSignInBrowser } from "./auth/sign-in-browser";
import { registrableDomain } from "./auth/status";
import { BinariesService } from "./services/binaries-service";
import { MetadataService } from "./services/metadata-service";
import { DownloadService } from "./services/download-service";
import { TranscriptService } from "./services/transcript-service";
import { SummarizeService } from "./services/summarize-service";
import { FrameService } from "./services/frame-service";
import { FrameExportService } from "./services/frame-export-service";
import { QueueWorker } from "./services/queue-worker";
import { ChannelService } from "./services/channel-service";
import { serveThumb } from "./services/thumbnail-cache";
import { WhisperSetupService } from "./services/whisper-setup-service";
import { createYtdlpSubsProvider } from "./transcript/ytdlp-subs-provider";
import { createWhisperProvider } from "./transcript/whisper-provider";
import {
  createYtDlpRunner,
  ytdlpFailureMessage,
  type YtDlpRunner,
} from "./sidecars/ytdlp";
import { createFfmpegRunner, type FfmpegRunner } from "./sidecars/ffmpeg";
import { createOcrRunner, type OcrRunner } from "./sidecars/ocr";
import { createWhisperRunner } from "./sidecars/whisper";
import { createAnthropicProvider } from "./ai/anthropic-provider";
import { createOpenAiProvider } from "./ai/openai-provider";
import { createOllamaProvider } from "./ai/ollama-provider";
import { createClaudeCliProvider } from "./ai/claude-cli-provider";
import { createCustomConfigStore, type CustomConfig } from "./ai/custom-config";
import {
  createAiDefaultConfigStore,
  type AiDefaultConfig,
} from "./settings/ai-default-config";
import { createTranscriptConfigStore } from "./settings/transcript-config";
import { createTranscriptMethodStore } from "./settings/transcript-method-config";
import { createAutoTranscriptStore } from "./settings/auto-transcript-config";
import { createDownloadsConfigStore } from "./settings/downloads-config";
import { createQueueConfigStore } from "./settings/queue-config";
import { createNetworkConfigStore } from "./settings/network-config";
import { check as profileCheck, type ProfileSlot } from "./services/profile";
import {
  createBinaryUpdatesConfigStore,
  type BinaryUpdatePolicy,
} from "./settings/binary-updates-config";
import { runStartupBinaryMaintenance } from "./services/binary-update-orchestrator";
import { createSecrets } from "./secrets";
import { createDiagnostics } from "./diagnostics";
import { resetStaleDownloads } from "./maintenance";
import {
  binariesDir,
  framesRootDir,
  binaryUpdatesConfigFile,
  cookiesFile,
  customConfigFile,
  aiDefaultConfigFile,
  downloadsConfigFile,
  downloadsDir,
  networkConfigFile,
  queueConfigFile,
  framesDir,
  tessdataDir,
  tesseractCacheDir,
  postersDir,
  secretsFile,
  thumbnailsDir,
  transcriptConfigFile,
  transcriptMethodConfigFile,
  autoTranscriptConfigFile,
  whisperDir,
  whisperModelsDir,
} from "./paths";

// The package name "@sift/desktop" has a slash, so the default userData path becomes
// Roaming/@sift/desktop — a mixed-separator path Chromium's network-sandbox migration chokes on
// ("Failed to delete file …\\Cookies"). Set a clean app name BEFORE any app.getPath("userData")
// call so userData is Roaming/Sift. Must precede the scheme reg and e2e block below.
app.setName(branding.appName);

// No native menu bar — Sift drives everything from its own UI (incl. an in-app Exit button).
// Removes the default File/Edit/View/… bar on Windows/Linux; standard editing shortcuts still
// work inside the renderer's inputs.
Menu.setApplicationMenu(null);

// The renderer references cached thumbnails as sift-thumb://img/<encoded remote url>. Must be
// registered as a privileged (standard + secure) scheme BEFORE app-ready so <img> can load it
// under the CSP. The handler (in whenReady) downloads-on-miss and serves from userData/thumbnails.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "sift-thumb",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
  // Serves downloaded video files to the in-app <video>. stream:true enables Range
  // requests so scrubbing/seeking works; secure+standard so it loads under the CSP.
  {
    scheme: "sift-media",
    privileges: { standard: true, secure: true, stream: true },
  },
  // Serves extracted slide frames to the renderer's <img>. Static JPEGs, no Range needed.
  {
    scheme: "sift-frame",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
  // Serves poster frames grabbed from imported local files. Its own scheme because
  // sift-thumb is a remote-URL cache with a host allowlist (it can't serve a local path)
  // and sift-frame gates on the `frame` table, which belongs to the Slides flow.
  {
    scheme: "sift-poster",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

// Offline e2e hook (see docs/DEVELOPMENT.md "e2e fixture hook"): when set, the app
// installs "yt-dlp"/"ffmpeg" from a local fixture directory instead of GitHub, and
// gets its own isolated userData dir so the test never touches (or is polluted by)
// a real install/db. Must run before any `app.getPath("userData")` call below.
const e2eFixtureDir = !app.isPackaged
  ? process.env.SIFT_E2E_FIXTURE_DIR
  : undefined;
if (e2eFixtureDir) {
  app.setPath(
    "userData",
    join(app.getPath("temp"), `sift-e2e-userdata-${randomUUID()}`),
  );
}

/**
 * Builds `BinarySource`s that resolve to a local fixture file (via a `fixture://`
 * pseudo-URL) instead of hitting GitHub. `ytdlp` and `deno` read their fixture
 * files and resolve to `fixture://<name>` so the offline e2e can install them;
 * `ffmpeg` fails fast since no fixture is provided for it.
 */
function fixtureSources(fixtureDir: string): Record<BinaryKind, BinarySource> {
  return {
    ytdlp: {
      kind: "ytdlp",
      async resolveLatest() {
        const sha256 = await sha256File(join(fixtureDir, "yt-dlp"));
        return {
          version: "9.9.9",
          assetUrl: "fixture://yt-dlp",
          sha256,
          binaryName: "yt-dlp",
        };
      },
    },
    ffmpeg: {
      kind: "ffmpeg",
      async resolveLatest() {
        throw new Error("No ffmpeg fixture provided for SIFT_E2E_FIXTURE_DIR");
      },
    },
    deno: {
      kind: "deno",
      async resolveLatest() {
        const sha256 = await sha256File(join(fixtureDir, "deno"));
        return {
          version: "9.9.9",
          assetUrl: "fixture://deno",
          sha256,
          binaryName: "deno",
        };
      },
    },
  };
}

/** Where offline-e2e downloads (and the m3u export that reads them) live: under the per-test
 * userData dir (randomUUID-isolated above), NOT shared system temp. A fixed system-temp path
 * leaked the download file across specs, so one spec's remove-download raced another spec's
 * read (flaky playlist-export / media-player). The fixture download writer and both services'
 * downloadsDir must agree on this so exportPlaylist writes beside the files it lists. */
function e2eDownloadsDir(): string {
  return join(app.getPath("userData"), "e2e-downloads");
}

/** A `fetch` replacement that serves `fixture://<name>` URLs from `fixtureDir` on disk. */
function fixtureFetch(fixtureDir: string): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const name = url.replace("fixture://", "");
    const bytes = await readFile(join(fixtureDir, name));
    return new Response(bytes, {
      status: 200,
      headers: { "content-length": String(bytes.length) },
    });
  }) as typeof fetch;
}

/** Canned `yt-dlp -J` dump served by the fixture `YtDlpRunner` (see `fixtureYtDlpRunner`). */
const FIXTURE_METADATA_JSON = {
  id: "fixture123",
  title: "Fixture Video Title",
  extractor_key: "Youtube",
  duration: 212,
  thumbnail: "https://example.com/fixture-thumb.jpg",
  uploader: "Fixture Channel",
  automatic_captions: { en: [{}] },
  formats: [
    {
      ext: "mp4",
      vcodec: "avc1.4d401f",
      acodec: "none",
      height: 720,
      tbr: 1000,
      filesize: 50_000_000,
    },
    {
      ext: "m4a",
      vcodec: "none",
      acodec: "mp4a.40.2",
      height: null,
      tbr: 128,
      filesize: 3_000_000,
    },
  ],
};

/**
 * Canned `--flat-playlist -J` dump served by the fixture `YtDlpRunner`'s `flatPlaylist`.
 * Finalized (Task 8) to match a real yt-dlp channel dump: channel identity/meta fields
 * consumed by `normalizeChannel`, avatar + banner thumbnails (picked by aspect ratio),
 * and two entries with titles/durations/view_counts consumed by `normalizeChannelEntries`.
 */
const FIXTURE_CHANNEL_JSON = {
  id: "UC_fixture",
  channel_id: "UC_fixture",
  channel: "Fixture Channel",
  uploader_id: "@fixture",
  channel_follower_count: 4242,
  playlist_count: 3,
  thumbnails: [
    { url: "https://example.com/avatar.jpg", width: 160, height: 160 },
    {
      url: "https://example.com/banner.jpg",
      width: 2048,
      height: 288,
      id: "banner",
    },
  ],
  entries: [
    {
      id: "fixv1",
      url: "https://www.youtube.com/watch?v=fixv1",
      title: "Fixture Channel Video 1",
      duration: 600,
      view_count: 100,
    },
    {
      id: "fixv2",
      url: "https://www.youtube.com/watch?v=fixv2",
      title: "Fixture Channel Video 2",
      duration: 45,
      view_count: 900,
    },
  ],
};

/** Canned feed/channels dump served by the fixture runner when the URL is the subscriptions feed. */
const FIXTURE_SUBS_JSON = {
  entries: [
    {
      id: "UC_sub_a",
      channel: "Sub Alpha",
      uploader_id: "@suba",
      channel_follower_count: 1000,
      thumbnails: [
        { url: "https://example.com/a.jpg", width: 100, height: 100 },
      ],
    },
    {
      id: "UC_sub_b",
      channel: "Sub Bravo",
      uploader_id: "@subb",
      channel_follower_count: 2000,
    },
  ],
};

/**
 * Beyond the brief's plain two-way branch: `channel:add` re-fetches `flatPlaylist` for the
 * subscription's own URL (`.../channel/UC_sub_a`) to import it, so a bare feed/else split would
 * have that import silently resolve to `FIXTURE_CHANNEL_JSON`'s unrelated "Fixture Channel"
 * identity instead of the subscription just synced. Recognize each subscription's own channel id
 * in the URL and hand back its data reshaped as a `normalizeChannel`-compatible dump, so importing
 * "Sub Alpha" actually yields a channel titled "Sub Alpha" — proving sync→import end to end.
 */
function subscriptionAsChannelFixture(
  sub: (typeof FIXTURE_SUBS_JSON.entries)[number],
): unknown {
  return {
    id: sub.id,
    channel_id: sub.id,
    channel: sub.channel,
    uploader_id: sub.uploader_id,
    channel_follower_count: sub.channel_follower_count,
    thumbnails: "thumbnails" in sub ? sub.thumbnails : [],
    entries: [],
  };
}

/** Canned WebVTT served by the fixture `YtDlpRunner`'s `fetchSubtitles` (see below). */
const FIXTURE_VTT = `WEBVTT

00:00:00.000 --> 00:00:02.000
Fixture caption line one

00:00:02.000 --> 00:00:04.000
Fixture caption line two
`;

/** A real (tiny, 16x16, 1-frame, H.264/mp4) video, base64-encoded, so the fixture `download()`
 * below writes bytes the in-app `<video>` can actually decode instead of an empty file — needed
 * since MediaPlayer's `onError` fallback (media-player.tsx) would otherwise flip an empty file
 * to the "Couldn't play this file" poster, defeating media-player.spec.ts's happy-path assertion. */
const FIXTURE_VIDEO_MP4_BASE64 =
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMMbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAjd0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAAAAGvbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAQABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABWm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAARpzdGJsAAAAtnN0c2QAAAAAAAAAAQAAAKZhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2Mi4xMS4xMDAgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALGF2Y0MBQsAK/+EAFWdCwAraewEQAAADABAAAAMAIPEiagEABGjOD8gAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAATKAAAAAAAAAAYc3R0cwAAAAAAAAABAAAAAQAAQAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAFHN0c3oAAAAAAAACZQAAAAEAAAAUc3RjbwAAAAAAAAABAAADPAAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZmNjIuMy4xMDAAAAAIZnJlZQAAAm1tZGF0AAACUwYF//9P3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NSByMzIyMiBiMzU2MDVhIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTAgcmVmPTEgZGVibG9jaz0wOjA6MCBhbmFseXNlPTA6MCBtZT1kaWEgc3VibWU9MCBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0wIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MCA4eDhkY3Q9MCBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0wIHRocmVhZHM9MSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTAgd2VpZ2h0cD0wIGtleWludD0yNTAga2V5aW50X21pbj0xIHNjZW5lY3V0PTAgaW50cmFfcmVmcmVzaD0wIHJjPWNyZiBtYnRyZWU9MCBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0wAIAAAAAKZYiEOiYoAAkC4A==";

/**
 * Offline `YtDlpRunner` stub for the e2e fixture branch: returns a canned `-J`
 * dump for any URL (normalizes to a "tested"-tier YouTube platform with
 * captions) and a fixed extractor list, so the metadata e2e never shells out
 * to a real yt-dlp binary or touches the network.
 */
function fixtureYtDlpRunner(): YtDlpRunner {
  return {
    async dumpJson(url: string): Promise<unknown> {
      // Drives the "yt-dlp has no extractor for this site" path — what a user hits by
      // pasting a link from an unsupported site — through the same message builder the
      // real runner uses, so metadata.spec.ts can assert the app surfaces it and stays
      // usable rather than dying on the rejected invoke.
      if (url.includes("unsupported.example")) {
        throw new Error(
          ytdlpFailureMessage(
            "while dumping JSON for",
            url,
            `ERROR: Unsupported URL: ${url}`,
          ),
        );
      }
      return FIXTURE_METADATA_JSON;
    },
    async flatPlaylist(url: string): Promise<unknown> {
      if (url.includes("/feed/channels")) return FIXTURE_SUBS_JSON;
      const sub = FIXTURE_SUBS_JSON.entries.find((e) => url.includes(e.id));
      return sub ? subscriptionAsChannelFixture(sub) : FIXTURE_CHANNEL_JSON;
    },
    async listExtractors(): Promise<string[]> {
      return ["Youtube", "Vimeo", "TikTok", "SomeOther"];
    },
    // Minimal inline stub for the e2e fixture branch: emits two canned progress
    // ticks then WRITES a real, decodable (tiny H.264/mp4) file at a fake path (no
    // spawn, no network), so the offline download e2e (Task 7, download.spec.ts)
    // never needs a real yt-dlp binary yet still exercises DownloadService's
    // existsSync guard, and media-player.spec.ts's in-app <video> can actually
    // play it (an empty file would trip MediaPlayer's onError→poster fallback).
    // The resolved filePath's base name matches FIXTURE_METADATA_JSON's
    // uploader/title via buildOutputBaseName's "<uploader>__<title>" convention
    // (@sift/core).
    async download(_opts, onProgress): Promise<{ filePath: string }> {
      onProgress({ received: 512, total: 1024, speed: 256, eta: 2 });
      onProgress({ received: 1024, total: 1024, speed: 256, eta: 0 });
      const dir = e2eDownloadsDir();
      mkdirSync(dir, { recursive: true });
      const filePath = join(dir, "Fixture Channel__Fixture Video Title.mp4");
      writeFileSync(filePath, Buffer.from(FIXTURE_VIDEO_MP4_BASE64, "base64"));
      return { filePath };
    },
    // Writes a canned VTT into the given outputDir (no spawn, no network), so the
    // offline transcript e2e (Task 7) can exercise TranscriptService end-to-end.
    async fetchSubtitles({
      outputDir,
    }): Promise<{ subPath: string; format: "json3" | "vtt" } | null> {
      const subPath = join(outputDir, "subs.vtt");
      writeFileSync(subPath, FIXTURE_VTT);
      return { subPath, format: "vtt" };
    },
  };
}

/** Canned summary text served by the fixture `AiProvider` (see `fixtureAiProvider`). */
const FIXTURE_SUMMARY = "Fixture summary line one.\nFixture summary line two.";

/**
 * Offline `AiProvider` stub for the e2e fixture branch: streams two canned token
 * deltas then resolves `FIXTURE_SUMMARY` for any input, so the summarize e2e never
 * needs a real Anthropic API key or hits the network. Parameterized by id/label so
 * the same stub can double as a keyless "ollama" fixture (Task 7) — proving the
 * provider picker lists multiple providers offline without a real Ollama daemon.
 */
function fixtureAiProvider(id = "anthropic", label = "Fixture AI"): AiProvider {
  return {
    id,
    label,
    needsKey: false,
    models: () => [{ id: "fixture-model", label: "Fixture" }],
    summarize: async (_input, onToken) => {
      for (const chunk of ["Fixture summary ", "line one."]) onToken(chunk);
      return FIXTURE_SUMMARY;
    },
  };
}

/** Offline whisper provider for the e2e fixture branch: returns canned segments for any
 * downloaded video (audioPath present), so a no-captions path can be exercised without a
 * real ffmpeg/whisper binary. */
function fixtureWhisperProvider(): TranscriptProvider {
  return {
    id: "whisper-cpp",
    label: "Local (whisper.cpp)",
    canHandle: (ctx) => ctx.audioPath !== null,
    transcribe: async (ctx) => ({
      providerId: "whisper-cpp",
      language: ctx.language,
      text: "Fixture whisper line one\nFixture whisper line two",
      segments: [
        { start: 0, end: 2, text: "Fixture whisper line one" },
        { start: 2, end: 4, text: "Fixture whisper line two" },
      ],
      model: "small",
    }),
  };
}

/** Renders self-contained HTML to a PDF buffer via a hidden BrowserWindow (no new dep).
 * Loads from a temp file rather than a data: URL — embedded slide images make the HTML
 * multi-MB, past comfortable data-URL limits. */
/** Promise form of execFile, for the ffmpeg calls the clip service makes. */
const execFileAsync = promisify(execFile);

async function renderPdf(html: string): Promise<Buffer> {
  const tmp = join(app.getPath("temp"), `sift-doc-${randomUUID()}.html`);
  writeFileSync(tmp, html, "utf8");
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, javascript: false },
  });
  try {
    await win.loadFile(tmp);
    return await win.webContents.printToPDF({ printBackground: true });
  } finally {
    win.destroy();
    rmSync(tmp, { force: true });
  }
}

// 1×1 JPEG — the fixture frame service writes this so the sift-frame:// protocol serves
// real image bytes in e2e (its allowlist + existsSync gate need a file on disk).
const FIXTURE_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==",
  "base64",
);

/** Offline frame extraction for the e2e fixture branch: a fake ffmpeg writes two tiny frame
 * images and a fake OCR returns canned slide text, so frames:extract runs end-to-end (DB +
 * protocol + panel) without a real ffmpeg/Tesseract/network. */
function fixtureFrameService(database: SiftDatabase): FrameService {
  const ffmpeg: FfmpegRunner = {
    extractWav: async () => {},
    // One scene change → settledGrabTimes prepends 0, so two frames get grabbed.
    detectSceneTimes: async () => [20],
    extractFrameAt: async ({ outputPath }) => {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, FIXTURE_JPEG);
    },
  };
  const makeOcr = (): OcrRunner => ({
    recognize: async (imagePath) => ({
      text: imagePath.endsWith("0001.jpg")
        ? "Fixture Slide One Q3 Revenue Up"
        : "Fixture Slide Two Roadmap Q4 Plan",
      wordCount: 5,
      meanConfidence: 90,
    }),
    close: async () => {},
  });
  // Maximally-distinct hashes so the two fixture frames aren't de-duped (the real dHash of
  // identical 1×1 JPEGs would collapse them). Must be valid 16-hex-char dHashes far apart in
  // Hamming distance — a path string isn't (two paths differ by only a couple of bits).
  const hashFrame = (p: string): string =>
    p.endsWith("0001.jpg") ? "ffffffffffffffff" : "0000000000000000";
  return new FrameService({
    db: database,
    ffmpeg,
    makeOcr,
    framesDir,
    hashFrame,
  });
}

/** Offline whisper setup for the e2e fixture branch: `install()` seeds a whisper asset row
 * + writes a fake model file (progress ticks), so the Settings card shows "Installed". No
 * real download/verify — keeps the whisper e2e offline. */
function fixtureWhisperSetup(
  database: SiftDatabase,
): Pick<WhisperSetupService, "status" | "install"> {
  const modelDir = join(app.getPath("userData"), "whisper-models");
  const modelPath = join(modelDir, "ggml-small.bin");
  const cliPath = join(binariesDir(), "whisper", "whisper-cli");
  const status = async () => ({
    binaryInstalled: getAsset(database, "whisper") !== undefined,
    binaryPath: (() => {
      const r = getAsset(database, "whisper");
      return r ? resolveAssetPath(binariesDir(), r.path) : null;
    })(),
    modelInstalled: existsSync(modelPath),
    modelPath: existsSync(modelPath) ? modelPath : null,
  });
  const install = async (
    onProgress?: (p: {
      stage: "binary" | "model";
      received: number;
      total: number | null;
    }) => void,
  ) => {
    onProgress?.({ stage: "binary", received: 1, total: 1 });
    mkdirSync(dirname(cliPath), { recursive: true });
    writeFileSync(cliPath, "");
    upsertAsset(database, {
      kind: "whisper",
      name: "whisper-cli",
      version: "v1.9.1",
      path: cliPath,
      sha256: "fixture",
      installed_at: Date.now(),
      last_checked: Date.now(),
    });
    onProgress?.({ stage: "model", received: 1, total: 1 });
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(modelPath, "");
    return status();
  };
  return { status, install };
}

let dbReady = false;
let db: SiftDatabase | null = null;

/**
 * The support-bundle collector. Built here (not inside `whenReady`) so the console capture
 * below is installed before any startup warning is emitted.
 *
 * Everything it reads is injected, and every accessor is defensive: a bundle is requested
 * precisely when something is broken, so a throw from one field must not lose the rest.
 */
const diagnostics = createDiagnostics({
  appVersion: () => app.getVersion(),
  isPackaged: () => app.isPackaged,
  locale: () => app.getLocale(),
  versions: () => process.versions,
  userDataDir: () => app.getPath("userData"),
  downloadsDir: () => {
    try {
      return diagnosticsSources?.downloadsPath() ?? downloadsDir();
    } catch {
      return downloadsDir();
    }
  },
  databaseFile: () => join(app.getPath("userData"), "sift.db"),
  primaryDisplay: () => {
    try {
      const d = screen.getPrimaryDisplay();
      return {
        width: d.size.width,
        height: d.size.height,
        scaleFactor: d.scaleFactor,
      };
    } catch {
      return null;
    }
  },
  freeDiskBytes: (path) => {
    try {
      return statfsSync(path).bavail * statfsSync(path).bsize;
    } catch {
      return null;
    }
  },
  binaries: () => {
    try {
      return (["ytdlp", "ffmpeg", "deno"] as AssetKind[]).map((kind) => {
        const asset = db ? getAsset(db, kind) : undefined;
        return {
          name: kind,
          installed: !!asset,
          version: asset?.version ?? null,
        };
      });
    } catch {
      return [];
    }
  },
  libraryCounts: () => {
    if (!db) return null;
    try {
      const count = (table: string): number =>
        db!.prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).get()
          ?.n ?? 0;
      return {
        media: count("media"),
        downloads: count("download"),
        transcripts: count("transcript"),
        summaries: count("summary"),
        frames: count("frame"),
      };
    } catch {
      return null;
    }
  },
  secureStorageAvailable: () => {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  },
  // Which providers have a key stored — never the keys themselves.
  keyedProviders: () => {
    try {
      return KEYED_AI_PROVIDER_IDS.filter((id) =>
        existsSync(secretsFile(id)),
      ) as string[];
    } catch {
      return [];
    }
  },
  settings: () => {
    try {
      return diagnosticsSources?.settings() ?? {};
    } catch {
      return {};
    }
  },
});

/**
 * The settings stores are constructed inside `whenReady`, after `diagnostics` exists, so
 * they are handed over here once they are available. Before that (and if startup fails
 * early) a bundle simply reports no settings, which is itself the useful signal.
 */
let diagnosticsSources: {
  downloadsPath: () => string;
  settings: () => Record<string, unknown>;
} | null = null;

// Console capture: main-process warnings and errors are the single most useful thing in a
// bug report, and the app has no log file. Wrapping the two console methods keeps every
// existing call site as-is instead of threading a logger through every service.
// ponytail: swap for a real logger if per-module levels or on-disk rotation are ever needed.
for (const level of ["warn", "error"] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]): void => {
    try {
      diagnostics.record(level, args.map(String).join(" "));
    } catch {
      /* never let diagnostics break logging */
    }
    original(...args);
  };
}
process.on("uncaughtException", (err) => {
  diagnostics.record("error", `uncaughtException: ${err.stack ?? err.message}`);
});
process.on("unhandledRejection", (reason) => {
  diagnostics.record("error", `unhandledRejection: ${String(reason)}`);
});

/** Accessor for the app-lifetime database handle. Available once db:isReady is true. */
export function getDb(): SiftDatabase {
  if (!db) throw new Error("Database not initialized yet");
  return db;
}

/** Resolve a managed binary's stored (relative) path to absolute, or null if not installed. */
function assetPath(kind: AssetKind): string | null {
  const row = getAsset(getDb(), kind);
  return row ? resolveAssetPath(binariesDir(), row.path) : null;
}

function initDb(): void {
  try {
    db = openDatabase(join(app.getPath("userData"), "sift.db"));
    const one = db.prepare<{ n: number }>("SELECT 1 AS n").get();
    runMigrations(db);
    normalizeAssetPaths(db, binariesDir());
    backfillMediaChannelIds(db);
    // Files imported before auto-tagging shipped predate LOCAL_TAG; INSERT OR IGNORE, so
    // this is a no-op on every launch after the first.
    backfillPlatformTag(db, LOCAL_PLATFORM_ID, LOCAL_TAG);
    dbReady = one?.n === 1;
  } catch (err) {
    console.error("Failed to initialize database:", err);
    dbReady = false;
  }
}

/** A URL's origin, or null if it's absent or unparseable (`file://` paths included). */
function safeOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const { origin } = new URL(url);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: branding.appName,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  // Standard Electron hardening, independent of the renderer's own drop-handling: without
  // this, a link or file dragged into the window (or any other in-app navigation attempt)
  // would navigate the renderer away from the app and destroy the session. Doesn't fire for
  // the initial loadURL/loadFile below, so it can't block startup.
  //
  // The one exception is dev-only: Vite's full-reload fallback (the renderer-initiated
  // `location.reload()` it uses when a module can't be hot-replaced) IS a will-navigate,
  // and cancelling it wedges the dev loop. Same-origin-as-the-dev-server navigations are
  // therefore allowed. In a packaged build ELECTRON_RENDERER_URL is unset, so devOrigin is
  // null and every navigation is cancelled, unchanged.
  const devOrigin = safeOrigin(process.env.ELECTRON_RENDERER_URL);
  win.webContents.on("will-navigate", (e, url) => {
    if (devOrigin && safeOrigin(url) === devOrigin) return;
    e.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  // Serve locally-cached thumbnails. sift-thumb://img/<encodeURIComponent(remote https url)>.
  protocol.handle("sift-thumb", async (req) => {
    const raw = decodeURIComponent(
      new URL(req.url).pathname.replace(/^\/+/, ""),
    );
    const r = await serveThumb({ dir: thumbnailsDir() }, raw);
    if (!r) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(r.body), {
      headers: {
        "content-type": r.contentType,
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  });

  // Serve downloaded (and imported) video files to the in-app player. sift-media://file/<encodeURIComponent(abs path)>.
  // security gate is download-table membership + existsSync — deliberately path-unbounded,
  // not a path-prefix sandbox: imported local files are referenced wherever the user keeps
  // them on disk, not copied into downloadsDir(), so a prefix check would break them.
  // Membership in the download table is the whole gate.
  protocol.handle("sift-media", async (req) => {
    const filePath = decodeURIComponent(
      new URL(req.url).pathname.replace(/^\/+/, ""),
    );
    if (
      !db ||
      !dbReady ||
      !downloadExistsByFilePath(getDb(), filePath) ||
      !existsSync(filePath)
    ) {
      return new Response(null, { status: 404 });
    }
    // Serve with explicit HTTP Range support so the <video> element is seekable: forward the
    // requested byte slice as a 206 stream (Content-Range/Accept-Ranges), else the whole file
    // as 200. Without this the element treats the media as non-seekable and every seek snaps to 0.
    const size = statSync(filePath).size;
    const contentType = mediaContentType(filePath);
    const range = parseRange(req.headers.get("Range"), size);
    if (range === "unsatisfiable") {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    if (range) {
      const body = Readable.toWeb(
        createReadStream(filePath, { start: range.start, end: range.end }),
      ) as ReadableStream<Uint8Array>;
      return new Response(body, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
          "Content-Length": String(range.end - range.start + 1),
        },
      });
    }
    const body = Readable.toWeb(
      createReadStream(filePath),
    ) as ReadableStream<Uint8Array>;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Content-Length": String(size),
      },
    });
  });

  // Serve extracted slide frames. sift-frame://file/<encodeURIComponent(abs path)>.
  // Same allowlist posture as sift-media: only paths we actually stored in `frame`.
  protocol.handle("sift-frame", async (req) => {
    const filePath = decodeURIComponent(
      new URL(req.url).pathname.replace(/^\/+/, ""),
    );
    if (
      !db ||
      !dbReady ||
      !frameExistsByImagePath(getDb(), filePath) ||
      !existsSync(filePath)
    ) {
      return new Response(null, { status: 404 });
    }
    // `readFile`, not `readFileSync`: this handler runs once per visible frame, and a
    // slides grid asks for dozens at once — a sync read stalls the whole main process.
    return new Response(new Uint8Array(await readFile(filePath)), {
      headers: { "content-type": "image/jpeg", "cache-control": "no-cache" },
    });
  });

  // Serve poster frames for imported local files. sift-poster://file/<encodeURIComponent(abs path)>.
  // Same allowlist posture as sift-frame: only paths a media row actually points at.
  protocol.handle("sift-poster", async (req) => {
    const filePath = decodeURIComponent(
      new URL(req.url).pathname.replace(/^\/+/, ""),
    );
    if (
      !db ||
      !dbReady ||
      !mediaExistsByThumbnailPath(getDb(), filePath) ||
      !existsSync(filePath)
    ) {
      return new Response(null, { status: 404 });
    }
    // `readFile`, not `readFileSync`: this handler runs once per visible frame, and a
    // slides grid asks for dozens at once — a sync read stalls the whole main process.
    return new Response(new Uint8Array(await readFile(filePath)), {
      headers: { "content-type": "image/jpeg", "cache-control": "no-cache" },
    });
  });

  initDb();
  registerAppIpc();
  registerDiagnosticsIpc(diagnostics, () => BrowserWindow.getAllWindows());
  registerUpdatesIpc(() => BrowserWindow.getAllWindows());
  registerOllamaIpc(!!e2eFixtureDir);
  registerDbIpc(() => dbReady);
  // Binaries IPC needs a live, migrated DB handle; skip wiring it if initDb() failed
  // or migrations didn't complete (dbReady false covers that case in the renderer
  // already via db:isReady). `db` alone is not enough: it can be a non-null but
  // unmigrated handle if runMigrations() threw.
  if (db && dbReady) {
    resetStaleDownloads(getDb());

    const binariesService = new BinariesService({
      db: getDb(),
      binariesDir: binariesDir(),
      sources: e2eFixtureDir ? fixtureSources(e2eFixtureDir) : SOURCES,
      platform: currentPlatform(),
      fetchImpl: e2eFixtureDir ? fixtureFetch(e2eFixtureDir) : undefined,
    });
    registerBinariesIpc(binariesService, () => BrowserWindow.getAllWindows());

    const binaryUpdatesStore = createBinaryUpdatesConfigStore({
      filePath: binaryUpdatesConfigFile(),
    });
    const { emit: emitBinaryUpdate } = registerBinaryUpdatesIpc(
      () => BrowserWindow.getAllWindows(),
      binaryUpdatesStore,
    );

    // Startup maintenance: install missing binaries (always) and, per policy, auto-update
    // or notify when outdated. Throttled to once/24h via AssetRow.last_checked. Fire-and-forget
    // so it never blocks window creation; events are cached for the startup-race replay.
    // Skipped under e2e unless a spec opts in, so unrelated specs don't see install toasts.
    const runMaintenance =
      !e2eFixtureDir || process.env.SIFT_E2E_BINARY_MAINTENANCE === "1";
    if (runMaintenance) {
      void runStartupBinaryMaintenance({
        kinds: ["ytdlp", "ffmpeg", "deno"],
        list: () => binariesService.list(),
        getLastChecked: (kind) => getAsset(getDb(), kind)?.last_checked ?? null,
        check: (kind) => binariesService.check(kind),
        install: (kind) =>
          binariesService.install(kind, (progress) => {
            for (const win of BrowserWindow.getAllWindows()) {
              win.webContents.send(IPC.binariesProgress, progress);
            }
          }),
        policy: () => binaryUpdatesStore.get(),
        emit: emitBinaryUpdate,
        now: () => Date.now(),
      });
    }

    const queueConfigStore = createQueueConfigStore({
      filePath: queueConfigFile(),
    });

    // Proxy config. One stored URL drives three consumers: yt-dlp's `--proxy`, Chromium's
    // session (which covers the renderer and anything on `net.fetch`), and `aiFetch` below.
    const networkConfigStore = createNetworkConfigStore({
      filePath: networkConfigFile(),
    });
    const applyProxy = (url: string): void => {
      void session.defaultSession
        .setProxy(url ? { proxyRules: url } : { mode: "direct" })
        .catch((e: unknown) => console.warn("Failed to apply proxy:", e));
    };
    applyProxy(networkConfigStore.get());

    // Transport handed to the remote AI SDKs. Node's global fetch ignores the Chromium
    // session proxy, so a configured proxy has to go through `net.fetch` instead; with no
    // proxy this is the SDKs' own default path. Checked per request, so changing the
    // setting takes effect without rebuilding the providers.
    const aiFetch: typeof globalThis.fetch = (input, init) =>
      networkConfigStore.get()
        ? (net.fetch(
            input as Parameters<typeof net.fetch>[0],
            init,
          ) as ReturnType<typeof globalThis.fetch>)
        : globalThis.fetch(input, init);

    const runner = e2eFixtureDir
      ? fixtureYtDlpRunner()
      : createYtDlpRunner({
          getBinaryPath: () => assetPath("ytdlp"),
          getJsRuntimePath: () => assetPath("deno"),
          getProxy: () => networkConfigStore.get(),
        });

    // e2e: an in-memory jar (no real Electron session/window/fs). Seeded signed-in so
    // the Sign-in settings tab has a site to show/remove offline.
    let e2eJar: ManagerCookie[] = e2eFixtureDir
      ? [
          {
            domain: ".youtube.com",
            path: "/",
            secure: true,
            expirationDate: 4102444800,
            name: "SID",
            value: "x",
          },
        ]
      : [];

    const authManager = createAuthManager({
      readAllCookies: e2eFixtureDir
        ? async (): Promise<ManagerCookie[]> => e2eJar
        : async (): Promise<ManagerCookie[]> => {
            const cookies = await session
              .fromPartition("persist:auth")
              .cookies.get({});
            return cookies.map((c) => ({
              domain: c.domain ?? "",
              path: c.path ?? "/",
              secure: Boolean(c.secure),
              expirationDate: c.expirationDate,
              name: c.name,
              value: c.value,
            }));
          },
      removeCookiesForDomain: e2eFixtureDir
        ? async (domain: string) => {
            e2eJar = e2eJar.filter(
              (c) => registrableDomain(c.domain) !== domain,
            );
          }
        : async (domain: string) => {
            const ses = session.fromPartition("persist:auth");
            const cookies = await ses.cookies.get({});
            await Promise.all(
              // Exact registrable-domain match (same grouping listSites uses) — a suffix
              // check would let removeSite("youtube.com") also wipe "evil-youtube.com".
              cookies
                .filter((c) => registrableDomain(c.domain ?? "") === domain)
                .map((c) => {
                  const host = (c.domain ?? "").replace(/^\./, "");
                  const url = `http${c.secure ? "s" : ""}://${host}${c.path ?? "/"}`;
                  return ses.cookies.remove(url, c.name);
                }),
            );
          },
      openBrowser: e2eFixtureDir ? async () => {} : () => openSignInBrowser(),
      cookiesPath: e2eFixtureDir
        ? () => join(e2eFixtureDir, "auth.txt")
        : cookiesFile,
      writeFile: e2eFixtureDir
        ? () => {}
        : (p, data) => {
            mkdirSync(dirname(p), { recursive: true });
            writeFileSync(p, data, "utf8");
          },
      removeFile: e2eFixtureDir ? () => {} : (p) => rmSync(p, { force: true }),
    });
    registerAuthIpc(authManager);

    const channelService = new ChannelService({
      db: getDb(),
      runner,
      getCookiesFile: authManager.cookiesFileForUrl,
      reportAuthFailure: authManager.reportAuthFailure,
    });
    registerChannelsIpc(channelService);

    const metadataService = new MetadataService(runner, {
      getCookiesFile: authManager.cookiesFileForUrl,
      reportAuthFailure: authManager.reportAuthFailure,
    });
    registerMetadataIpc(metadataService);

    const downloadsConfigStore = createDownloadsConfigStore({
      filePath: downloadsConfigFile(),
      defaultDir: downloadsDir(),
    });
    registerDownloadsIpc(downloadsConfigStore, () =>
      BrowserWindow.getFocusedWindow(),
    );

    const downloadService = new DownloadService({
      db: getDb(),
      runner,
      downloadsDir: e2eFixtureDir
        ? e2eDownloadsDir
        : () => downloadsConfigStore.get(),
      binariesDir: binariesDir(),
      framesDir,
      getCookiesFile: authManager.cookiesFileForUrl,
      reportAuthFailure: authManager.reportAuthFailure,
    });
    registerDownloadIpc(downloadService, () => BrowserWindow.getAllWindows());
    registerImportIpc(downloadService, {
      getWindows: () => BrowserWindow.getAllWindows(),
      db: getDb(),
      // Its own runner instance (like FrameService's) — `getBinaryPath` is resolved per
      // call, so this works whether or not ffmpeg is installed yet.
      ffmpeg: createFfmpegRunner({ getBinaryPath: () => assetPath("ffmpeg") }),
      postersDir,
    });
    registerLibraryIpc(downloadService, getDb);
    registerTagsIpc(getDb());
    registerCollectionsIpc(getDb);

    const transcriptConfigStore = createTranscriptConfigStore({
      filePath: transcriptConfigFile(),
    });
    // Persisted default transcript method (auto/prefer_whisper/captions_only). Also
    // handed to TranscriptService via getMethod (Task 5) so the resolver can honor it.
    const transcriptMethodStore = createTranscriptMethodStore({
      filePath: transcriptMethodConfigFile(),
    });
    // Persisted "auto-fetch transcript after download" toggle (default on).
    const autoTranscriptStore = createAutoTranscriptStore({
      filePath: autoTranscriptConfigFile(),
    });
    const transcriptRegistry = new TranscriptRegistry();
    transcriptRegistry.register(createYtdlpSubsProvider({ runner }));

    const modelFilePath = () => join(whisperModelsDir(), "ggml-small.bin");
    const whisperInstalled = () => {
      const p = assetPath("whisper");
      return p !== null && existsSync(p) && existsSync(modelFilePath());
    };

    if (e2eFixtureDir) {
      transcriptRegistry.register(fixtureWhisperProvider());
    } else {
      const ffmpegRunner = createFfmpegRunner({
        getBinaryPath: () => assetPath("ffmpeg"),
      });
      const whisperRunner = createWhisperRunner({
        getBinaryPath: () => assetPath("whisper"),
        getModelPath: () =>
          existsSync(modelFilePath()) ? modelFilePath() : null,
      });
      transcriptRegistry.register(
        createWhisperProvider({
          ffmpeg: ffmpegRunner,
          whisper: whisperRunner,
          isInstalled: whisperInstalled,
        }),
      );
    }

    const whisperSetup = e2eFixtureDir
      ? fixtureWhisperSetup(getDb())
      : new WhisperSetupService({
          db: getDb(),
          whisperDir: whisperDir(),
          modelsDir: whisperModelsDir(),
          platform: currentPlatform(),
        });
    registerWhisperIpc(whisperSetup, () => BrowserWindow.getAllWindows());

    const transcriptService = new TranscriptService({
      db: getDb(),
      registry: transcriptRegistry,
      downloadsDir: e2eFixtureDir
        ? e2eDownloadsDir
        : () => downloadsConfigStore.get(),
      getPreferredLanguages: transcriptConfigStore.get,
      getMethod: () => transcriptMethodStore.get(),
      getCookiesFile: authManager.cookiesFileForUrl,
      reportAuthFailure: authManager.reportAuthFailure,
    });
    registerTranscriptIpc(
      transcriptService,
      () => BrowserWindow.getAllWindows(),
      transcriptMethodStore,
      autoTranscriptStore,
    );
    registerSettingsIpc(transcriptConfigStore, {
      get: () => networkConfigStore.get(),
      set: (url) => {
        const stored = networkConfigStore.set(url);
        applyProxy(stored);
        return stored;
      },
    });

    // One encrypted secrets store per keyed provider (anthropic, openai, custom),
    // memoized so repeated IPC calls for the same provider reuse the same instance
    // instead of re-touching the filesystem seam on every call.
    const secretsById = new Map<string, ReturnType<typeof createSecrets>>();
    const secretsFor = (
      providerId: string,
    ): ReturnType<typeof createSecrets> => {
      let secrets = secretsById.get(providerId);
      if (!secrets) {
        secrets = createSecrets({
          safeStorage,
          filePath: secretsFile(providerId),
        });
        secretsById.set(providerId, secrets);
      }
      return secrets;
    };

    const aiRegistry = new AiRegistry();

    // Non-secret base_url/model for the custom (OpenAI-compatible) provider (Task 4).
    // The API key itself still lives in secretsFor("custom") via safeStorage.
    const customConfigStore = createCustomConfigStore({
      filePath: customConfigFile(),
    });

    // The user's default provider + model (seeds the pickers). Keyless — non-secret JSON.
    const aiDefaultStore = createAiDefaultConfigStore({
      filePath: aiDefaultConfigFile(),
    });

    /** Builds and registers a fresh provider for `providerId` after a key is set. */
    const rebuild = (providerId: string, key: string): void => {
      switch (providerId) {
        case "anthropic":
          aiRegistry.register(
            createAnthropicProvider({ apiKey: key, fetch: aiFetch }),
          );
          break;
        case "openai":
          aiRegistry.register(
            createOpenAiProvider({ apiKey: key, fetch: aiFetch }),
          );
          break;
        case "custom": {
          // custom is the OpenAI provider pointed at a user base_url with a
          // single free-text model — no separate SDK, no model discovery; that's exactly
          // what "OpenAI-compatible endpoint" means.
          const cfg = customConfigStore.get();
          if (cfg) {
            aiRegistry.register(
              createOpenAiProvider({
                apiKey: key,
                baseURL: cfg.baseUrl,
                fetch: aiFetch,
                id: "custom",
                label: "Custom (OpenAI-compatible)",
                models: [{ id: cfg.model, label: cfg.model }],
              }),
            );
          } else {
            // A key was set but no base_url/model configured yet — nothing to register.
            aiRegistry.unregister("custom");
          }
          break;
        }
        default:
          console.warn(`No rebuild wired for AI provider "${providerId}" yet`);
      }
    };

    if (e2eFixtureDir) {
      // Keyless fixture set (Task 7): proves the provider picker lists multiple
      // providers, and prompt CRUD works, fully offline. Ollama's fixture never
      // dials a real daemon — same canned stub, just a second registry id/label.
      aiRegistry.register(fixtureAiProvider("anthropic", "Fixture AI"));
      aiRegistry.register(fixtureAiProvider("ollama", "Fixture Ollama"));
      aiRegistry.register(
        fixtureAiProvider("claude-cli", "Fixture Claude CLI"),
      );
    } else {
      const apiKey = secretsFor("anthropic").getKey();
      if (apiKey)
        aiRegistry.register(
          createAnthropicProvider({ apiKey, fetch: aiFetch }),
        );
      // else: no provider registered until the user sets a key; summarize.start
      // throws "Unknown AI provider" → UI prompts to add a key

      const openaiKey = secretsFor("openai").getKey();
      if (openaiKey)
        aiRegistry.register(
          createOpenAiProvider({ apiKey: openaiKey, fetch: aiFetch }),
        );

      // Ollama is local + keyless — always registered, unlike the keyed providers
      // above which wait for a stored secret. Reachability is only checked when
      // summarize() actually dials the daemon.
      aiRegistry.register(createOllamaProvider({}));

      // Claude Code CLI — keyless like Ollama; always registered. Uses the user's
      // logged-in `claude` subscription (a missing/logged-out CLI errors at call time).
      aiRegistry.register(createClaudeCliProvider({}));

      const customKey = secretsFor("custom").getKey();
      const customConfig = customConfigStore.get();
      if (customKey && customConfig) {
        aiRegistry.register(
          createOpenAiProvider({
            apiKey: customKey,
            baseURL: customConfig.baseUrl,
            fetch: aiFetch,
            id: "custom",
            label: "Custom (OpenAI-compatible)",
            models: [{ id: customConfig.model, label: customConfig.model }],
          }),
        );
      }
    }
    const summarizeService = new SummarizeService({
      db: getDb(),
      registry: aiRegistry,
      downloadsDir: e2eFixtureDir
        ? e2eDownloadsDir
        : () => downloadsConfigStore.get(),
    });
    registerSummarizeIpc(summarizeService, () => BrowserWindow.getAllWindows());

    // Portable settings profile. Every store is already a `{ get, set }` pair, so a slot is
    // that pair plus a shape check. Deliberately absent: API keys (safeStorage-encrypted per
    // machine, so a copy wouldn't decrypt elsewhere), sign-in cookies, and the library.
    const profileSlots = (): ProfileSlot[] => [
      {
        key: "transcriptLanguages",
        read: () => transcriptConfigStore.get(),
        check: profileCheck.stringArray,
        write: (v) => transcriptConfigStore.set(v as string[]),
      },
      {
        key: "transcriptMethod",
        read: () => transcriptMethodStore.get(),
        check: profileCheck.oneOf("auto", "prefer_whisper", "captions_only"),
        write: (v) => transcriptMethodStore.set(v as TranscriptMethod),
      },
      {
        key: "autoTranscript",
        read: () => autoTranscriptStore.get(),
        check: profileCheck.boolean,
        write: (v) => autoTranscriptStore.set(v as boolean),
      },
      {
        key: "aiDefault",
        read: () => aiDefaultStore.get(),
        check: profileCheck.objectOrNull,
        write: (v) => aiDefaultStore.set(v as AiDefaultConfig | null),
      },
      {
        key: "downloadsPath",
        read: () => downloadsConfigStore.get(),
        check: profileCheck.string,
        write: (v) => downloadsConfigStore.set(v as string),
      },
      {
        key: "queue",
        read: () => queueConfigStore.get(),
        check: profileCheck.object,
        write: (v) => queueConfigStore.set(v as QueueConfig),
      },
      {
        key: "binaryUpdates",
        read: () => binaryUpdatesStore.get(),
        check: profileCheck.oneOf("auto", "notify"),
        write: (v) => binaryUpdatesStore.set(v as BinaryUpdatePolicy),
      },
      {
        key: "proxyUrl",
        read: () => networkConfigStore.get(),
        check: profileCheck.string,
        write: (v) => {
          applyProxy(networkConfigStore.set(v as string));
        },
      },
      {
        // The custom endpoint's base_url + model, not its key.
        key: "customEndpoint",
        read: () => customConfigStore.get(),
        check: profileCheck.object,
        write: (v) => customConfigStore.set(v as CustomConfig),
      },
    ];
    registerProfileIpc({
      slots: profileSlots,
      getDb,
      getWindows: () => BrowserWindow.getAllWindows(),
    });

    // Export presets and clips. Both reuse machinery that already exists: the PDF path is the
    // same `printToPDF` renderer the slides export uses, and the clip cutter is the managed
    // ffmpeg binary.
    const exportService = new ExportService({
      db: getDb(),
      outputDir: () => downloadsConfigStore.get(),
      renderPdf,
    });
    const clipService = new ClipService({
      db: getDb(),
      outputDir: () => downloadsConfigStore.get(),
      runFfmpeg: async (args) => {
        const path = assetPath("ffmpeg");
        if (!path)
          throw new Error(
            "Clipping needs ffmpeg — install it in Settings → Binaries.",
          );
        await execFileAsync(path, args, { maxBuffer: 1024 * 1024 * 16 });
      },
    });
    registerExportClipIpc({
      getDb,
      exportService: () => exportService,
      clipService: () => clipService,
    });

    registerStorageIpc({
      dirs: () => ({
        thumbnails: thumbnailsDir(),
        posters: postersDir(),
        frames: framesRootDir(),
        whisperModels: whisperModelsDir(),
        binaries: binariesDir(),
        tesseract: tesseractCacheDir(),
        databaseFile: join(app.getPath("userData"), "sift.db"),
        downloadsDir: downloadsConfigStore.get(),
      }),
      getDb,
      getWindows: () => BrowserWindow.getAllWindows(),
      freeDiskBytes: (path) => {
        try {
          return statfsSync(path).bavail * statfsSync(path).bsize;
        } catch {
          return null;
        }
      },
    });

    // Slide/data-frame extraction: reuses the managed ffmpeg binary; OCR via a lazily
    // created Tesseract worker per run. langPath points at the bundled eng.traineddata
    // (see paths.tessdataDir), so first-run OCR is fully offline.
    const frameService = e2eFixtureDir
      ? fixtureFrameService(getDb())
      : new FrameService({
          db: getDb(),
          ffmpeg: createFfmpegRunner({
            getBinaryPath: () => assetPath("ffmpeg"),
          }),
          makeOcr: () =>
            createOcrRunner({
              langPath: tessdataDir(),
              cachePath: tesseractCacheDir(),
            }),
          framesDir,
        });
    const frameExportService = new FrameExportService({
      db: getDb(),
      registry: aiRegistry,
      downloadsDir: e2eFixtureDir
        ? e2eDownloadsDir
        : () => downloadsConfigStore.get(),
      renderPdf,
    });
    registerFramesIpc(frameService, frameExportService, () =>
      BrowserWindow.getAllWindows(),
    );

    const queueWorker = new QueueWorker({
      db: getDb(),
      metadata: metadataService,
      download: downloadService,
      transcript: transcriptService,
      summarize: summarizeService,
      emit: (items) => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(IPC.queueUpdate, items);
        }
      },
      config: queueConfigStore,
    });
    registerQueueIpc(queueWorker);
    // Re-queue anything left 'running' by a crash, then drain in the background.
    queueWorker.recover();

    registerAiProvidersIpc(
      aiRegistry,
      secretsFor,
      rebuild,
      customConfigStore,
      aiDefaultStore,
    );

    // Everything the support bundle reports about configuration. Non-secret values only —
    // see the contract in `main/diagnostics.ts`.
    diagnosticsSources = {
      downloadsPath: () => downloadsConfigStore.get(),
      settings: () => ({
        transcriptMethod: transcriptMethodStore.get(),
        transcriptLanguages: transcriptConfigStore.get(),
        autoTranscript: autoTranscriptStore.get(),
        aiDefault: aiDefaultStore.get(),
        customEndpointConfigured: !!customConfigStore.get(),
        // A boolean, never the URL — a proxy URL can carry credentials.
        proxyConfigured: networkConfigStore.get().length > 0,
        downloadsPathIsDefault: downloadsConfigStore.get() === downloadsDir(),
      }),
    };
  }
  createWindow();

  // Auto-update: on a packaged startup, kick a check. The listeners in
  // registerUpdatesIpc turn the result into the in-app toast (autoDownload is off,
  // so the user chooses). Inert until a real GitHub release exists. Non-fatal.
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("Update check failed:", err);
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  try {
    db?.close();
  } catch {
    // best-effort; the OS reclaims the handle on exit anyway
  }
});
