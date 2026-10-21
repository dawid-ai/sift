import {
  execFile,
  spawn as nodeSpawn,
  type ChildProcess,
  type ExecFileException,
} from "node:child_process";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  /** Aborting kills the yt-dlp process. Without it "cancel" only stops the queue at the
   * next op boundary, so a cancelled 2 GB download keeps running to completion. */
  signal?: AbortSignal;
}

/** Thrown when `signal` aborts a download. Distinct from a yt-dlp failure so callers can
 * tell "the user stopped this" from "this broke". */
export class DownloadCanceledError extends Error {
  constructor() {
    super("Download canceled.");
    this.name = "DownloadCanceledError";
  }
}

/** Minimal shape of a Node ChildProcess that `download()` depends on. */
export interface SpawnedProcess {
  stdout: { on(ev: "data", cb: (chunk: Buffer | string) => void): void };
  stderr: { on(ev: "data", cb: (chunk: Buffer | string) => void): void };
  on(ev: "close", cb: (code: number | null) => void): void;
  on(ev: "error", cb: (err: Error) => void): void;
  /** Optional so existing test fakes stay valid; the real ChildProcess has both. */
  pid?: number;
  kill?(signal?: NodeJS.Signals | number): boolean;
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

// yt-dlp writes scratch files (the temp download behind "Testing format") to its
// working directory. An installed app inherits `C:\Program Files\Sift`, which isn't
// writable, and yt-dlp stalls forever at "Testing format" instead of failing. Run it
// from the OS temp dir so those writes always succeed.
const YTDLP_CWD = tmpdir();

const EXEC_TIMEOUT_MS = 60_000;

// On POSIX each yt-dlp gets its own process group, so `killProcessTree` can signal the
// whole group. Not on Windows, where `detached` opens a new console window instead.
const DETACHED = process.platform !== "win32";

/**
 * Kills `child` and every process under it. The release builds of yt-dlp are
 * PyInstaller one-file executables: the process we start is a bootloader that runs the
 * real yt-dlp as its own child. `child.kill()` stops only the bootloader and orphans
 * that worker, which then runs until it finishes on its own — forever, if it's stuck.
 */
export function killProcessTree(child: {
  pid?: number;
  kill?(signal?: NodeJS.Signals | number): boolean;
}): void {
  if (child.pid !== undefined) {
    if (process.platform === "win32") {
      execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => {
        // The tree already exited; nothing left to stop.
      });
      return;
    }
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // Not a process-group leader (not spawned by us); fall back to the single process.
    }
  }
  try {
    child.kill?.("SIGKILL");
  } catch {
    /* already gone */
  }
}

/** yt-dlp processes started by the default exec/spawn that haven't exited yet. */
const liveProcesses = new Set<ChildProcess>();

function track<T extends ChildProcess>(child: T): T {
  liveProcesses.add(child);
  const forget = (): void => {
    liveProcesses.delete(child);
  };
  child.once("close", forget);
  child.once("error", forget);
  return child;
}

/**
 * Stops every yt-dlp process still running, for app quit. Windows doesn't end child
 * processes with their parent, so an in-flight fetch or download would keep running
 * after the window closes.
 */
export function killAllYtDlp(): void {
  for (const child of liveProcesses) killProcessTree(child);
}

// execFile forwards `detached` to spawn, but its options type doesn't declare it. Passing
// the options as a variable (not a literal) skips the excess-property check.
const EXEC_OPTIONS = {
  cwd: YTDLP_CWD,
  detached: DETACHED,
  maxBuffer: 1024 * 1024 * 64,
  encoding: "utf8" as const,
};

const defaultExec: ExecFn = (file, args) =>
  new Promise((resolve, reject) => {
    let timedOut = false;
    // The callback runs asynchronously, after `timer` below is initialized.
    const child = track(
      execFile(
        file,
        args,
        EXEC_OPTIONS,
        (err: ExecFileException | null, stdout: string, stderr: string) => {
          clearTimeout(timer);
          if (err) {
            // Attach stdout/stderr the way promisified execFile does, since `stderrOf`
            // reads them. A hung yt-dlp under --no-warnings has usually printed nothing,
            // so a timeout says so explicitly.
            const note = timedOut
              ? `\nERROR: yt-dlp returned nothing within ${EXEC_TIMEOUT_MS / 1000} s and was stopped.`
              : "";
            reject(Object.assign(err, { stdout, stderr: stderr + note }));
            return;
          }
          resolve({ stdout, stderr });
        },
      ),
    );
    // Our own timer rather than execFile's `timeout`, which signals only the bootloader.
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, EXEC_TIMEOUT_MS);
  });

const defaultSpawn: SpawnFn = (file, args) =>
  track(nodeSpawn(file, args, { cwd: YTDLP_CWD, detached: DETACHED }));

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
  /** Configured proxy URL, or `""`/absent for a direct connection. Read per call, not
   * captured, so changing it in Settings takes effect without restarting the app. */
  getProxy?: () => string;
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

  // Prepended to every invocation. The store validates the scheme and host before persisting,
  // so nothing that reaches argv here can be read as another flag.
  const proxyArgs = (): string[] => {
    const url = deps.getProxy?.() ?? "";
    return url ? ["--proxy", url] : [];
  };

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
          ...proxyArgs(),
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
        ...proxyArgs(),
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
        ...proxyArgs(),
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
        if (opts.signal?.aborted) {
          reject(new DownloadCanceledError());
          return;
        }
        // yt-dlp stream/flag behavior (which stream carries which line) is
        // verified on first real download — parsing is unit-tested; wiring needs one
        // human-run tuning pass (see Phase 3 follow-ups).
        const proc = spawnProcess(path, args);

        // A tree kill also stops the yt-dlp worker behind the bootloader and any ffmpeg
        // it started to merge streams.
        let canceled = false;
        const onAbort = (): void => {
          canceled = true;
          killProcessTree(proc);
          reject(new DownloadCanceledError());
        };
        opts.signal?.addEventListener("abort", onAbort, { once: true });
        const detach = (): void =>
          opts.signal?.removeEventListener("abort", onAbort);

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
          detach();
          reject(err);
        });

        proc.on("close", (code) => {
          detach();
          // A cancel already rejected with DownloadCanceledError; the non-zero exit that
          // follows the kill must not overwrite it with "yt-dlp download failed".
          if (canceled) return;
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
        ...proxyArgs(),
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
