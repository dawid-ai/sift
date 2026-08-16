import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecFn, SpawnedProcess, SpawnFn } from "./ytdlp";
import { createYtDlpRunner, parseProgressLine, YtDlpNotInstalledError } from "./ytdlp";

const FAKE_PATH = "/opt/sift/bin/yt-dlp";

const CANNED_JSON = JSON.stringify({
  id: "dQw4w9WgXcQ",
  title: "Never Gonna Give You Up",
  duration: 213,
});

/**
 * Creates a fake SpawnedProcess that records its registered listeners so
 * tests can drive stdout/stderr `data` and `close`/`error` events manually.
 */
function createFakeProcess() {
  const listeners: {
    stdoutData?: (chunk: Buffer | string) => void;
    stderrData?: (chunk: Buffer | string) => void;
    close?: (code: number | null) => void;
    error?: (err: Error) => void;
  } = {};

  const proc: SpawnedProcess = {
    stdout: {
      on: (ev, cb) => {
        if (ev === "data") listeners.stdoutData = cb;
      },
    },
    stderr: {
      on: (ev, cb) => {
        if (ev === "data") listeners.stderrData = cb;
      },
    },
    on: (ev, cb) => {
      if (ev === "close") listeners.close = cb as (code: number | null) => void;
      if (ev === "error") listeners.error = cb as (err: Error) => void;
    },
  };

  return { proc, listeners };
}

describe("createYtDlpRunner", () => {
  describe("dumpJson", () => {
    it("resolves to the parsed JSON and calls exec with the URL as a discrete array element", async () => {
      const calls: Array<{ file: string; args: string[] }> = [];
      const exec: ExecFn = async (file, args) => {
        calls.push({ file, args });
        return { stdout: CANNED_JSON, stderr: "" };
      };

      const runner = createYtDlpRunner({ getBinaryPath: () => FAKE_PATH, exec });
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      const result = await runner.dumpJson(url);

      expect(result).toEqual(JSON.parse(CANNED_JSON));
      expect(calls).toHaveLength(1);
      const [call] = calls;
      expect(call?.file).toBe(FAKE_PATH);
      expect(call?.args).toEqual(["--js-runtimes", "node", "-J", "--no-warnings", "--", url]);
      const separatorIndex = call?.args.indexOf("--");
      expect(separatorIndex).toBeGreaterThanOrEqual(0);
      expect(call?.args[(separatorIndex ?? -1) + 1]).toBe(url);
    });

    it("rejects with YtDlpNotInstalledError when no binary path is configured", async () => {
      const exec: ExecFn = async () => {
        throw new Error("exec should not be called");
      };
      const runner = createYtDlpRunner({ getBinaryPath: () => null, exec });

      await expect(runner.dumpJson("https://example.com/video")).rejects.toBeInstanceOf(
        YtDlpNotInstalledError,
      );
    });

    it("rejects with a descriptive Error (not a raw SyntaxError) when stdout is not valid JSON", async () => {
      const exec: ExecFn = async () => ({ stdout: "not json{{{", stderr: "" });
      const runner = createYtDlpRunner({ getBinaryPath: () => FAKE_PATH, exec });

      await expect(runner.dumpJson("https://example.com/video")).rejects.toThrow(Error);
    });

    it("dumpJson adds --cookies before -- when a cookiesFile is given", async () => {
      const calls: string[][] = [];
      const runner = createYtDlpRunner({
        getBinaryPath: () => "yt-dlp",
        exec: async (_f, args) => {
          calls.push(args);
          return { stdout: "{}", stderr: "" };
        },
      });
      await runner.dumpJson("https://x/1", "/tmp/c.txt");
      expect(calls[0]).toEqual(["--cookies", "/tmp/c.txt", "--js-runtimes", "node", "-J", "--no-warnings", "--", "https://x/1"]);
    });

    it("reports an unsupported site as a plain sentence, not a yt-dlp stack", async () => {
      const url = "https://dribbble.com/shots/27595845-Motion-Graphics-Promo";
      const exec: ExecFn = async () => {
        throw Object.assign(new Error("Command failed: yt-dlp --cookies C:\\Users\\me\\auth.txt …"), {
          stderr: `ERROR: Unsupported URL: ${url}\n`,
        });
      };
      const runner = createYtDlpRunner({ getBinaryPath: () => FAKE_PATH, exec });

      await expect(runner.dumpJson(url)).rejects.toThrow(
        /yt-dlp has no extractor for dribbble\.com/,
      );
      // The command line (which carries the user's local cookie path) must not reach the UI.
      await expect(runner.dumpJson(url)).rejects.not.toThrow(/auth\.txt|Command failed/);
    });

    it("keeps raw stderr for every other failure, so auth detection still matches", async () => {
      const exec: ExecFn = async () => {
        throw Object.assign(new Error("Command failed"), {
          stderr: "ERROR: Sign in to confirm you're not a bot\n",
        });
      };
      const runner = createYtDlpRunner({ getBinaryPath: () => FAKE_PATH, exec });

      await expect(runner.dumpJson("https://youtu.be/x")).rejects.toThrow(
        /Sign in to confirm you're not a bot/,
      );
    });

    it("dumpJson omits --cookies when no cookiesFile is given", async () => {
      const calls: string[][] = [];
      const runner = createYtDlpRunner({
        getBinaryPath: () => "yt-dlp",
        exec: async (_f, args) => {
          calls.push(args);
          return { stdout: "{}", stderr: "" };
        },
      });
      await runner.dumpJson("https://x/1");
      expect(calls[0]).not.toContain("--cookies");
    });
  });

  describe("flatPlaylist", () => {
    it("flatPlaylist builds --flat-playlist -J with items + cookies, url after --", async () => {
      let captured: string[] = [];
      const runner = createYtDlpRunner({
        getBinaryPath: () => "/yt-dlp",
        exec: async (_file, args) => { captured = args; return { stdout: "{}", stderr: "" }; },
      });
      await runner.flatPlaylist("https://youtube.com/@c/videos", { items: "1:50" }, "/cookies.txt");
      expect(captured).toEqual([
        "--cookies", "/cookies.txt",
        "--flat-playlist", "-J", "--no-warnings",
        "--playlist-items", "1:50",
        "--", "https://youtube.com/@c/videos",
      ]);
    });

    it("flatPlaylist omits --playlist-items when items is absent and cookies when none", async () => {
      let captured: string[] = [];
      const runner = createYtDlpRunner({
        getBinaryPath: () => "/yt-dlp",
        exec: async (_file, args) => { captured = args; return { stdout: "{}", stderr: "" }; },
      });
      await runner.flatPlaylist("https://youtube.com/@c/videos", {});
      expect(captured).toEqual(["--flat-playlist", "-J", "--no-warnings", "--", "https://youtube.com/@c/videos"]);
    });
  });

  describe("listExtractors", () => {
    it("splits stdout into non-empty trimmed lines", async () => {
      const exec: ExecFn = async () => ({ stdout: "Youtube\nVimeo\n\n", stderr: "" });
      const runner = createYtDlpRunner({ getBinaryPath: () => FAKE_PATH, exec });

      const extractors = await runner.listExtractors();

      expect(extractors).toEqual(["Youtube", "Vimeo"]);
    });

    it("rejects with YtDlpNotInstalledError when no binary path is configured", async () => {
      const exec: ExecFn = async () => {
        throw new Error("exec should not be called");
      };
      const runner = createYtDlpRunner({ getBinaryPath: () => null, exec });

      await expect(runner.listExtractors()).rejects.toBeInstanceOf(YtDlpNotInstalledError);
    });
  });

  describe("download", () => {
    it("resolves with the printed filePath and reports progress parsed from stdout", async () => {
      const calls: Array<{ file: string; args: string[] }> = [];
      const { proc, listeners } = createFakeProcess();
      const spawn: SpawnFn = (file, args) => {
        calls.push({ file, args });
        return proc;
      };

      const runner = createYtDlpRunner({ getBinaryPath: () => FAKE_PATH, spawn });
      const onProgress = vi.fn();
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

      const promise = runner.download(
        { url, format: "bestvideo+bestaudio", outputTemplate: "/out/dir/%(title)s.%(ext)s" },
        onProgress,
      );

      listeners.stdoutData?.("SIFTPROG 512 1024 256 2\n/out/dir/Video.mp4\n");
      listeners.close?.(0);

      const result = await promise;

      expect(result).toEqual({ filePath: "/out/dir/Video.mp4" });
      expect(onProgress).toHaveBeenCalledWith({ received: 512, total: 1024, speed: 256, eta: 2 });

      expect(calls).toHaveLength(1);
      const [call] = calls;
      expect(call?.file).toBe(FAKE_PATH);
      const args = call?.args ?? [];
      expect(args[args.length - 2]).toBe("--");
      expect(args[args.length - 1]).toBe(url);
      const formatIndex = args.indexOf("-f");
      expect(formatIndex).toBeGreaterThanOrEqual(0);
      expect(args[formatIndex + 1]).toBe("bestvideo+bestaudio");
      // JS runtime for YouTube's n-challenge (else "Requested format is not available").
      const jsrIndex = args.indexOf("--js-runtimes");
      expect(jsrIndex).toBeGreaterThanOrEqual(0);
      expect(args[jsrIndex + 1]).toBe("node");
      // Force UTF-8 stdout so non-ASCII filepaths aren't mojibake on Windows.
      const encIndex = args.indexOf("--encoding");
      expect(encIndex).toBeGreaterThanOrEqual(0);
      expect(args[encIndex + 1]).toBe("UTF-8");
    });

    it("handles progress and filePath lines split across multiple stdout chunks", async () => {
      const { proc, listeners } = createFakeProcess();
      const spawn: SpawnFn = () => proc;
      const runner = createYtDlpRunner({ getBinaryPath: () => FAKE_PATH, spawn });
      const onProgress = vi.fn();

      const promise = runner.download(
        { url: "https://example.com/v", format: "best", outputTemplate: "/out/%(title)s.%(ext)s" },
        onProgress,
      );

      listeners.stdoutData?.("SIFTPROG 100 NA NA NA\n/out/dir/Par");
      listeners.stdoutData?.("tial.mp4\n");
      listeners.close?.(0);

      const result = await promise;

      expect(result).toEqual({ filePath: "/out/dir/Partial.mp4" });
      expect(onProgress).toHaveBeenCalledWith({ received: 100, total: null, speed: null, eta: null });
    });

    it("ignores non-progress stderr diagnostics and never lets them override the stdout filePath", async () => {
      const { proc, listeners } = createFakeProcess();
      const spawn: SpawnFn = () => proc;
      const runner = createYtDlpRunner({ getBinaryPath: () => FAKE_PATH, spawn });
      const onProgress = vi.fn();

      const promise = runner.download(
        { url: "https://example.com/v", format: "best", outputTemplate: "/out/%(title)s.%(ext)s" },
        onProgress,
      );

      listeners.stdoutData?.("SIFTPROG 512 1024 256 2\n/out/dir/Video.mp4\n");
      listeners.stderrData?.("[youtube] Extracting URL\n");
      listeners.close?.(0);

      const result = await promise;

      expect(result).toEqual({ filePath: "/out/dir/Video.mp4" });
      expect(onProgress).toHaveBeenCalledWith({ received: 512, total: 1024, speed: 256, eta: 2 });
    });

    it("rejects when yt-dlp exits with a non-zero code, including stderr text in the error", async () => {
      const { proc, listeners } = createFakeProcess();
      const spawn: SpawnFn = () => proc;
      const runner = createYtDlpRunner({ getBinaryPath: () => FAKE_PATH, spawn });

      const promise = runner.download(
        { url: "https://example.com/v", format: "best", outputTemplate: "/out/%(title)s.%(ext)s" },
        () => {},
      );

      listeners.stderrData?.("ERROR: something broke\n");
      listeners.close?.(1);

      await expect(promise).rejects.toThrow(/something broke/);
    });

    it("rejects when the spawned process emits an error event", async () => {
      const { proc, listeners } = createFakeProcess();
      const spawn: SpawnFn = () => proc;
      const runner = createYtDlpRunner({ getBinaryPath: () => FAKE_PATH, spawn });

      const promise = runner.download(
        { url: "https://example.com/v", format: "best", outputTemplate: "/out/%(title)s.%(ext)s" },
        () => {},
      );

      listeners.error?.(new Error("ENOENT"));

      await expect(promise).rejects.toThrow(/ENOENT/);
    });

    it("throws YtDlpNotInstalledError when no binary path is configured, without spawning", async () => {
      const spawn: SpawnFn = () => {
        throw new Error("spawn should not be called");
      };
      const runner = createYtDlpRunner({ getBinaryPath: () => null, spawn });

      await expect(
        runner.download(
          { url: "https://example.com/v", format: "best", outputTemplate: "/out/%(title)s.%(ext)s" },
          () => {},
        ),
      ).rejects.toBeInstanceOf(YtDlpNotInstalledError);
    });
  });

  describe("fetchSubtitles", () => {
    it("fetchSubtitles returns the written vtt path, passing safe args", async () => {
      const dir = mkdtempSync(join(tmpdir(), "sift-subs-"));
      try {
        let recordedArgs: string[] = [];
        const exec = async (_file: string, args: string[]) => {
          recordedArgs = args;
          writeFileSync(join(dir, "subs.en.vtt"), "WEBVTT\n"); // simulate yt-dlp writing the file
          return { stdout: "", stderr: "" };
        };
        const runner = createYtDlpRunner({ getBinaryPath: () => "/bin/yt-dlp", exec });
        const res = await runner.fetchSubtitles({ url: "https://y/x", language: "en", outputDir: dir });
        expect(res).toEqual({ subPath: join(dir, "subs.en.vtt"), format: "vtt" });
        expect(recordedArgs.slice(-2)).toEqual(["--", "https://y/x"]);
        expect(recordedArgs).toContain("--skip-download");
        expect(recordedArgs[recordedArgs.indexOf("--sub-langs") + 1]).toBe("en");
        expect(recordedArgs[recordedArgs.indexOf("--sub-format") + 1]).toBe("json3/vtt");
        expect(recordedArgs).not.toContain("--convert-subs");
        // n-challenge JS runtime — subtitle extraction resolves formats too.
        expect(recordedArgs[recordedArgs.indexOf("--js-runtimes") + 1]).toBe("node");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("fetchSubtitles prefers the exact-language vtt over a translated one", async () => {
      const dir = mkdtempSync(join(tmpdir(), "sift-subs-"));
      try {
        const exec = async () => {
          // yt-dlp could leave a stray translated track on disk; we must pick "en".
          writeFileSync(join(dir, "subs.en-ar.vtt"), "WEBVTT\n");
          writeFileSync(join(dir, "subs.en.vtt"), "WEBVTT\n");
          return { stdout: "", stderr: "" };
        };
        const runner = createYtDlpRunner({ getBinaryPath: () => "/bin/yt-dlp", exec });
        const res = await runner.fetchSubtitles({ url: "https://y/x", language: "en", outputDir: dir });
        expect(res).toEqual({ subPath: join(dir, "subs.en.vtt"), format: "vtt" });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("fetchSubtitles prefers json3 over vtt when both exist for the exact language", async () => {
      const dir = mkdtempSync(join(tmpdir(), "sift-subs-"));
      try {
        const exec = async () => {
          writeFileSync(join(dir, "subs.en.vtt"), "WEBVTT\n");
          writeFileSync(join(dir, "subs.en.json3"), JSON.stringify({ events: [] }));
          return { stdout: "", stderr: "" };
        };
        const runner = createYtDlpRunner({ getBinaryPath: () => "/bin/yt-dlp", exec });
        const res = await runner.fetchSubtitles({ url: "https://y/x", language: "en", outputDir: dir });
        expect(res).toEqual({ subPath: join(dir, "subs.en.json3"), format: "json3" });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("fetchSubtitles returns null when no vtt is produced (no captions)", async () => {
      const dir = mkdtempSync(join(tmpdir(), "sift-subs-"));
      try {
        const exec = async () => ({ stdout: "", stderr: "" }); // writes nothing
        const runner = createYtDlpRunner({ getBinaryPath: () => "/bin/yt-dlp", exec });
        expect(await runner.fetchSubtitles({ url: "https://y/x", language: "en", outputDir: dir })).toBeNull();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("fetchSubtitles throws YtDlpNotInstalledError when binary is missing", async () => {
      const runner = createYtDlpRunner({ getBinaryPath: () => null });
      await expect(
        runner.fetchSubtitles({ url: "https://y/x", language: "en", outputDir: "/nope" }),
      ).rejects.toBeInstanceOf(YtDlpNotInstalledError);
    });

    it("fetchSubtitles adds --cookies when given", async () => {
      const calls: string[][] = [];
      const runner = createYtDlpRunner({
        getBinaryPath: () => "yt-dlp",
        exec: async (_f, args) => {
          calls.push(args);
          return { stdout: "", stderr: "" };
        },
      });
      // outputDir must exist for readdirSync; use the OS temp dir (empty result → null return is fine).
      const os = await import("node:os");
      await runner.fetchSubtitles({ url: "https://x/1", language: "en", outputDir: os.tmpdir(), cookiesFile: "/tmp/c.txt" });
      expect(calls[0]?.slice(0, 2)).toEqual(["--cookies", "/tmp/c.txt"]);
    });
  });
});

describe("yt-dlp js runtime selection", () => {
  it("uses deno:<path> when a deno path is available", async () => {
    const calls: string[][] = [];
    const runner = createYtDlpRunner({
      getBinaryPath: () => FAKE_PATH,
      getJsRuntimePath: () => "/data/binaries/deno",
      exec: async (_file, args) => {
        calls.push(args);
        return { stdout: "{}", stderr: "" };
      },
    });
    await runner.dumpJson("https://x/y");
    expect(calls[0]).toContain("--js-runtimes");
    expect(calls[0]).toContain("deno:/data/binaries/deno");
  });

  it("falls back to node when no deno path", async () => {
    const calls: string[][] = [];
    const runner = createYtDlpRunner({
      getBinaryPath: () => FAKE_PATH,
      getJsRuntimePath: () => null,
      exec: async (_file, args) => {
        calls.push(args);
        return { stdout: "{}", stderr: "" };
      },
    });
    await runner.dumpJson("https://x/y");
    expect(calls[0]).toContain("--js-runtimes");
    expect(calls[0]).toContain("node");
  });
});

describe("parseProgressLine", () => {
  it("parses a full progress line with numeric fields", () => {
    expect(parseProgressLine("SIFTPROG 1024 2048 512 3")).toEqual({
      received: 1024,
      total: 2048,
      speed: 512,
      eta: 3,
    });
  });

  it("maps NA fields to null and keeps received", () => {
    expect(parseProgressLine("SIFTPROG 500 NA NA NA")).toEqual({
      received: 500,
      total: null,
      speed: null,
      eta: null,
    });
  });

  it("returns null for non-progress yt-dlp output lines", () => {
    expect(parseProgressLine("[download] Destination: foo")).toBeNull();
  });

  it("returns null for an empty line", () => {
    expect(parseProgressLine("")).toBeNull();
  });
});
