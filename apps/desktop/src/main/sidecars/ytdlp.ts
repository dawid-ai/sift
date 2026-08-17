import { execFile, spawn as nodeSpawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

/** Thrown when no yt-dlp binary is installed/registered (see @sift/db `getAsset`). */
export class YtDlpNotInstalledError extends Error {
  constructor(
    message = "yt-dlp is not installed — install it in Settings → Binaries",
  ) {
    super(message);
    this.name = "YtDlpNotInstalledError";
  }
}

export type ExecFn = (
  file: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

/** Raw progress values parsed from a `SIFTPROG` line (see `parseProgressLine`). */
export interface RawDownloadProgress {
  received: number; // downloaded_bytes
  total: number | null; // total_bytes (null when yt-dlp reports "NA")
  speed: number | null; // bytes/sec
  eta: number | null; // seconds
}

export interface DownloadOpts {
  url: string;
  format: string; // a yt-dlp -f selector string
  outputTemplate: string; // absolute -o template, e.g. "<dir>/<base>.%(ext)s"
  ffmpegLocation?: string; // path to the managed ffmpeg binary, so yt-dlp can merge video+audio
  cookiesFile?: string; // path to a Netscape-format cookies file for authenticated requests
}

/** Minimal shape of a Node ChildProcess that `download()` depends on. */
export interface SpawnedProcess {
  stdout: { on(ev: "data", cb: (chunk: Buffer | string) => void): void };
  stderr: { on(ev: "data", cb: (chunk: Buffer | string) => void): void };
  on(ev: "close", cb: (code: number | null) => void): void;
  on(ev: "error", cb: (err: Error) => void): void;
}

export type SpawnFn = (file: string, args: string[]) => SpawnedProcess;

export interface SubtitleOpts {
  url: string;
  language: string; // exact track, e.g. "en" → yt-dlp --sub-langs "en" (NOT "en.*")
  outputDir: string; // absolute; the subtitle file (json3 or vtt) is written here
  cookiesFile?: string; // path to a Netscape-format cookies file for authenticated requests
}

export interface YtDlpRunner {
  dumpJson(url: string, cookiesFile?: string): Promise<unknown>;
  flatPlaylist(
    url: string,
    opts: { items?: string },
    cookiesFile?: string,
  ): Promise<unknown>;
  listExtractors(): Promise<string[]>;
  download(
    opts: DownloadOpts,
    onProgress: (p: RawDownloadProgress) => void,
  ): Promise<{ filePath: string }>;
  fetchSubtitles(
    opts: SubtitleOpts,
  ): Promise<{ subPath: string; format: "json3" | "vtt" } | null>;
}

const execFileAsync = promisify(execFile);

const defaultExec: ExecFn = async (file, args) => {
  const { stdout, stderr } = await execFileAsync(file, args, {
    maxBuffer: 1024 * 1024 * 64,
    timeout: 60_000,
    killSignal: "SIGKILL",
  });
  return { stdout: stdout.toString(), stderr: stderr.toString() };
};

const defaultSpawn: SpawnFn = (file, args) => nodeSpawn(file, args);

/** Host of `url` without a `www.` prefix, or the raw url if it doesn't parse. */
function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

/** yt-dlp's reply when no extractor matches the URL at all. */
const UNSUPPORTED_URL_RE = /^ERROR:\s*Unsupported URL:/im;

/**
 * Turns a failed yt-dlp invocation into a message meant for a person.
 *
 * "Unsupported URL" is a **normal** outcome, not a fault — someone pastes a link from a
 * site yt-dlp has no extractor for (a Dribbble shot, a news article). The default shape,
 * `yt-dlp failed while dumping JSON for <url>: ERROR: Unsupported URL: <url>`, repeats the
 * URL twice and reads like a stack trace, so that one case gets a plain sentence pointing
 * at the page that lists what *is* supported.
 *
 * Every other failure keeps its raw stderr: auth walls, geo-blocks, rate limits and
 * network errors all carry detail the user needs, and `isAuthError` pattern-matches
 * against this very message downstream (see `MetadataService`/`DownloadService`).
 */
export function ytdlpFailureMessage(
  action: string,
  url: string,
  stderr: string,
): string {
  const trimmed = stderr.trim();
  if (UNSUPPORTED_URL_RE.test(trimmed)) {
    return `yt-dlp has no extractor for ${hostLabel(url)}, so this link can't be fetched. Settings → Platforms lists every site it supports.`;
  }
  return `yt-dlp failed ${action} ${url}${trimmed ? `: ${trimmed}` : ""}`;
}

/** stderr off a rejected `execFile`, or "" when the error carries none. */
function stderrOf(err: unknown): string {
  return err && typeof err === "object" && "stderr" in err
    ? String((err as { stderr?: unknown }).stderr ?? "").trim()
    : "";
}

const PROGRESS_LINE_RE = /^SIFTPROG (\S+) (\S+) (\S+) (\S+)$/;

function num(s: string): number | null {
  if (s === "NA") return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

/** Parses a single line of yt-dlp output emitted by our `--progress-template`. */
export function parseProgressLine(line: string): RawDownloadProgress | null {
  const match = PROGRESS_LINE_RE.exec(line);
  if (!match) {
    return null;
  }
  const receivedRaw = match[1] ?? "";
  const totalRaw = match[2] ?? "";
  const speedRaw = match[3] ?? "";
  const etaRaw = match[4] ?? "";
  return {
    received: num(receivedRaw) ?? 0,
    total: num(totalRaw),
    speed: num(speedRaw),
    eta: num(etaRaw),
  };
}

export function createYtDlpRunner(deps: {
  getBinaryPath: () => string | null;
  getJsRuntimePath?: () => string | null;
  exec?: ExecFn;
  spawn?: SpawnFn;
}): YtDlpRunner {
  const exec = deps.exec ?? defaultExec;
  const spawnProcess = deps.spawn ?? defaultSpawn;

  function requireBinaryPath(): string {
    const path = deps.getBinaryPath();
    if (!path) {
      throw new YtDlpNotInstalledError();
    }
    return path;
  }

  const cookieArgs = (cookiesFile?: string): string[] =>
    cookiesFile ? ["--cookies", cookiesFile] : [];

  // YouTube's "n" signature challenge must be solved in JavaScript to unlock the real
  // media/format URLs; without a JS runtime yt-dlp only sees storyboards and fails with
  // "Requested format is not available". yt-dlp bundles the solver (yt_dlp_ejs) but needs
  // an external runtime. Prefer the bundled Deno asset (packaged builds work without a
  // system JS runtime); fall back to system Node on PATH when Deno isn't installed.
  // Needed by every call that extracts the video (dumpJson, download, AND subtitle fetch —
  // yt-dlp resolves formats during subtitle extraction too, so it hits the same challenge).
  // Only --flat-playlist skips it (flat listing, no formats).
  function jsRuntimeArgs(): string[] {
    const deno = deps.getJsRuntimePath?.() ?? null;
    return deno ? ["--js-runtimes", `deno:${deno}`] : ["--js-runtimes", "node"];
  }

  return {
    async dumpJson(url: string, cookiesFile?: string): Promise<unknown> {
      const path = requireBinaryPath();
      let stdout: string;
      let stderr: string;
      try {
        ({ stdout, stderr } = await exec(path, [
          ...cookieArgs(cookiesFile),
          ...jsRuntimeArgs(),
          "-J",
          "--no-warnings",
          "--",
          url,
        ]));
      } catch (err) {
        throw new Error(
          ytdlpFailureMessage("while dumping JSON for", url, stderrOf(err)),
          { cause: err },
        );
      }
      try {
        return JSON.parse(stdout);
      } catch (err) {
        const trimmedStderr = stderr.trim();
        const suffix = trimmedStderr ? `: ${trimmedStderr}` : "";
        throw new Error(`yt-dlp returned invalid JSON for ${url}${suffix}`, {
          cause: err,
        });
      }
    },

    async flatPlaylist(url, opts, cookiesFile): Promise<unknown> {
      const path = requireBinaryPath();
      const args = [
        ...cookieArgs(cookiesFile),
        "--flat-playlist",
        "-J",
        "--no-warnings",
        ...(opts.items ? ["--playlist-items", opts.items] : []),
        "--",
        url,
      ];
      let stdout: string;
      try {
        ({ stdout } = await exec(path, args));
      } catch (err) {
        throw new Error(ytdlpFailureMessage("listing", url, stderrOf(err)), {
          cause: err,
        });
      }
      try {
        return JSON.parse(stdout);
      } catch (err) {
        throw new Error(`yt-dlp returned invalid JSON for ${url}`, {
          cause: err,
        });
      }
    },

    async listExtractors(): Promise<string[]> {
      const path = requireBinaryPath();
      const { stdout } = await exec(path, ["--list-extractors"]);
      return stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    },

    async download(
      opts: DownloadOpts,
      onProgress: (p: RawDownloadProgress) => void,
    ): Promise<{ filePath: string }> {
      const path = requireBinaryPath();

      const args = [
        ...cookieArgs(opts.cookiesFile),
        ...jsRuntimeArgs(),
        "-f",
        opts.format,
        "-o",
        opts.outputTemplate,
        "--no-playlist",
        "--newline",
        "--quiet",
        "--no-warnings",
        "--progress",
        "--progress-template",
        "SIFTPROG %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.speed)s %(progress.eta)s",
        "--print",
        "after_move:filepath",
        // Force UTF-8 stdout. On Windows yt-dlp otherwise prints the filepath in the
        // console code page, so paths with non-ASCII (e.g. Polish ż/ł/ó) come back as
        // mojibake and the existsSync verification below wrongly reports "file missing".
        // Verified: only this flag fixes it (PYTHONUTF8/PYTHONIOENCODING do not).
        "--encoding",
        "UTF-8",
        ...(opts.ffmpegLocation
          ? ["--ffmpeg-location", opts.ffmpegLocation]
          : []),
        "--",
        opts.url,
      ];

      return new Promise((resolve, reject) => {
        // yt-dlp stream/flag behavior (which stream carries which line) is
        // verified on first real download — parsing is unit-tested; wiring needs one
        // human-run tuning pass (see Phase 3 follow-ups).
        const proc = spawnProcess(path, args);

        let filePathCandidate: string | null = null;
        let lastStderr = "";
        let stdoutBuffer = "";
        let stderrBuffer = "";

        function handleLine(line: string, isStdout: boolean): void {
          const progress = parseProgressLine(line);
          if (progress) {
            onProgress(progress);
            return;
          }
          if (!isStdout) return; // stderr diagnostics never set the filepath
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("SIFTPROG")) {
            filePathCandidate = trimmed;
          }
        }

        function consume(
          chunk: Buffer | string,
          buffer: string,
          isStdout: boolean,
        ): string {
          const combined = buffer + String(chunk);
          const lines = combined.split(/\r?\n/);
          const remainder = lines.pop() ?? "";
          for (const line of lines) {
            handleLine(line, isStdout);
          }
          return remainder;
        }

        proc.stdout.on("data", (chunk) => {
          stdoutBuffer = consume(chunk, stdoutBuffer, true);
        });

        proc.stderr.on("data", (chunk) => {
          const text = String(chunk);
          lastStderr = text.trim() || lastStderr;
          stderrBuffer = consume(chunk, stderrBuffer, false);
        });

        proc.on("error", (err) => {
          reject(err);
        });

        proc.on("close", (code) => {
          if (code === 0 && filePathCandidate) {
            resolve({ filePath: filePathCandidate });
            return;
          }
          const suffix = lastStderr ? `: ${lastStderr}` : "";
          reject(
            new Error(
              `yt-dlp download failed (exit code ${String(code)})${suffix}`,
            ),
          );
        });
      });
    },

    async fetchSubtitles(
      opts: SubtitleOpts,
    ): Promise<{ subPath: string; format: "json3" | "vtt" } | null> {
      const path = requireBinaryPath();

      // Request ONLY the exact language track. A glob like "en.*" also matches every
      // auto-TRANSLATED track (en-ar, en-fr, en-zh, …) — yt-dlp then downloads all of
      // them one by one, which is wasteful and reliably trips YouTube's HTTP 429 rate
      // limit. "en" fetches the original English captions (manual, else auto) only.
      const args = [
        ...cookieArgs(opts.cookiesFile),
        ...jsRuntimeArgs(),
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        opts.language,
        "--sub-format",
        "json3/vtt",
        // (removed: --convert-subs vtt — we keep json3 as-is)
        "--no-playlist",
        "--no-warnings",
        "-o",
        join(opts.outputDir, "subs.%(ext)s"),
        "--",
        opts.url,
      ];

      await exec(path, args); // ExecFn; a non-zero exit rejects — let it propagate

      const files = readdirSync(opts.outputDir).filter(
        (f) =>
          f.toLowerCase().endsWith(".json3") ||
          f.toLowerCase().endsWith(".vtt"),
      );
      const langTag = `.${opts.language.toLowerCase()}.`;
      // prefer the exact-language file; prefer json3 over vtt when both exist
      const pick =
        files.find(
          (f) =>
            f.toLowerCase().includes(langTag) &&
            f.toLowerCase().endsWith(".json3"),
        ) ??
        files.find((f) => f.toLowerCase().includes(langTag)) ??
        files.find((f) => f.toLowerCase().endsWith(".json3")) ??
        files[0];
      if (!pick) return null;
      return {
        subPath: join(opts.outputDir, pick),
        format: pick.toLowerCase().endsWith(".json3") ? "json3" : "vtt",
      };
    },
  };
}
