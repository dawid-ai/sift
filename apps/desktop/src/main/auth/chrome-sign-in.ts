// apps/desktop/src/main/auth/chrome-sign-in.ts
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";
import type { Readable, Writable } from "node:stream";
import type { ChromeSignInResult } from "@sift/ipc-contract";

// Google refuses sign-in from embedded browsers ("This browser or app may not be
// secure"), so the built-in sign-in window can't reach YouTube. This signs in through the
// user's own installed Chrome or Edge instead, on a profile only Sift uses:
//   1. `openSignInWindow` launches the browser normally — no remote debugging, no
//      automation flags — so Google sees an ordinary browser.
//   2. After the user closes it, `readProfileCookies` restarts the browser headless on the
//      same profile and reads the cookies over the DevTools protocol. The browser decrypts
//      its own cookie store, so Chrome's app-bound cookie encryption, which stops yt-dlp's
//      `--cookies-from-browser` on Windows, doesn't apply.
// Browsers refuse remote debugging on their default profile, which is why this uses a
// dedicated one rather than the user's everyday profile.
//
// Node-loadable (no Electron): process spawning is injectable for tests.

export interface ChromiumBrowser {
  name: string;
  path: string;
}

/** A cookie as the DevTools protocol's `Storage.getCookies` returns it. */
export interface ProfileCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  /** Seconds since epoch; -1 for a session cookie. */
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  partitionKey?: unknown;
}

export const SIGN_IN_URL =
  "https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/";

/** First installed Chrome, then Edge (always present on Windows 11), or null. */
export function findChromium(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean = existsSync,
): ChromiumBrowser | null {
  const candidates: ChromiumBrowser[] = [];
  if (platform === "win32") {
    const roots = [
      env.ProgramFiles,
      env["ProgramFiles(x86)"],
      env.LOCALAPPDATA,
    ].filter((r): r is string => Boolean(r));
    for (const root of roots) {
      candidates.push({
        name: "Chrome",
        path: win32.join(root, "Google", "Chrome", "Application", "chrome.exe"),
      });
    }
    for (const root of roots) {
      candidates.push({
        name: "Edge",
        path: win32.join(
          root,
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe",
        ),
      });
    }
  } else if (platform === "darwin") {
    candidates.push(
      {
        name: "Chrome",
        path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      },
      {
        name: "Edge",
        path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      },
    );
  } else {
    for (const bin of ["google-chrome", "google-chrome-stable"]) {
      candidates.push({ name: "Chrome", path: posix.join("/usr/bin", bin) });
    }
    candidates.push(
      { name: "Edge", path: "/usr/bin/microsoft-edge" },
      { name: "Chromium", path: "/usr/bin/chromium" },
    );
  }
  return candidates.find((c) => exists(c.path)) ?? null;
}

function profileArgs(profileDir: string): string[] {
  return [
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
  ];
}

export type ChromeSpawnFn = typeof nodeSpawn;

/** Opens a normal browser window on the Sift profile; resolves when the browser exits. */
export function openSignInWindow(
  browser: ChromiumBrowser,
  profileDir: string,
  url: string,
  spawn: ChromeSpawnFn = nodeSpawn,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(browser.path, [...profileArgs(profileDir), url], {
      stdio: "ignore",
    });
    proc.once("error", reject);
    proc.once("exit", () => resolve());
  });
}

/** Splits a `--remote-debugging-pipe` stream into its NUL-terminated JSON messages. */
export function createMessageSplitter(
  onMessage: (msg: unknown) => void,
): (chunk: Buffer | string) => void {
  let buffer = "";
  return (chunk) => {
    buffer += String(chunk);
    let end = buffer.indexOf("\0");
    while (end !== -1) {
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (raw) onMessage(JSON.parse(raw));
      end = buffer.indexOf("\0");
    }
  };
}

/** Thrown when the browser exits before answering, which is what a locked profile does:
 * it hands the launch to the instance already holding the profile and quits. */
class BrowserExitedError extends Error {
  constructor() {
    super("The browser exited before returning cookies.");
    this.name = "BrowserExitedError";
  }
}

async function readOnce(
  browser: ChromiumBrowser,
  profileDir: string,
  spawn: ChromeSpawnFn,
  timeoutMs: number,
): Promise<ProfileCookie[]> {
  // The pipe (fds 3 and 4) instead of a debugging port: nothing else on the machine can
  // connect to it while the cookies are being read.
  const proc: ChildProcess = spawn(
    browser.path,
    [
      ...profileArgs(profileDir),
      "--headless=new",
      "--remote-debugging-pipe",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] },
  );
  const toBrowser = proc.stdio[3] as Writable;
  const fromBrowser = proc.stdio[4] as Readable;

  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (r: unknown) => void; reject: (e: Error) => void }
  >();
  const failAll = (err: Error): void => {
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };
  fromBrowser.on(
    "data",
    createMessageSplitter((msg) => {
      const m = msg as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };
      if (m.id === undefined) return;
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message));
      else p.resolve(m.result);
    }),
  );
  fromBrowser.on("error", () => {});
  toBrowser.on("error", () => {});
  let exited = false;
  proc.once("exit", () => {
    exited = true;
    failAll(new BrowserExitedError());
  });
  proc.once("error", (err) => failAll(err));

  const call = (method: string): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (exited) {
        reject(new BrowserExitedError());
        return;
      }
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      toBrowser.write(`${JSON.stringify({ id, method })}\0`);
    });

  const timer = setTimeout(
    () => failAll(new Error("The browser didn't return cookies in time.")),
    timeoutMs,
  );
  try {
    const result = (await call("Storage.getCookies")) as {
      cookies?: ProfileCookie[];
    };
    await call("Browser.close").catch(() => {});
    return result.cookies ?? [];
  } finally {
    clearTimeout(timer);
    if (!exited) proc.kill();
  }
}

/**
 * Reads every cookie in the Sift browser profile via a headless instance of the browser.
 * Retries while the profile is still locked by the sign-in window shutting down.
 */
export async function readProfileCookies(
  browser: ChromiumBrowser,
  profileDir: string,
  opts: {
    spawn?: ChromeSpawnFn;
    attempts?: number;
    retryDelayMs?: number;
    timeoutMs?: number;
  } = {},
): Promise<ProfileCookie[]> {
  const attempts = opts.attempts ?? 5;
  for (let i = 1; ; i++) {
    try {
      return await readOnce(
        browser,
        profileDir,
        opts.spawn ?? nodeSpawn,
        opts.timeoutMs ?? 20_000,
      );
    } catch (err) {
      if (!(err instanceof BrowserExitedError) || i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 1000));
    }
  }
}

/** Google's long-lived account cookies; present only once someone is signed in. */
const GOOGLE_SESSION_COOKIES = new Set(["SID", "__Secure-3PSID"]);

export function hasGoogleSession(cookies: ProfileCookie[]): boolean {
  return cookies.some(
    (c) =>
      GOOGLE_SESSION_COOKIES.has(c.name) &&
      /(^|\.)(google|youtube)\.com$/i.test(c.domain),
  );
}

/** The subset of Electron's `CookiesSetDetails` this module produces. */
export interface SessionCookieDetails {
  url: string;
  name: string;
  value: string;
  domain?: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
  sameSite: "unspecified" | "no_restriction" | "lax" | "strict";
}

const SAME_SITE: Record<string, SessionCookieDetails["sameSite"]> = {
  Strict: "strict",
  Lax: "lax",
  None: "no_restriction",
};

/** Converts a profile cookie into the details `session.cookies.set` takes. */
export function toSessionCookie(c: ProfileCookie): SessionCookieDetails {
  const host = c.domain.replace(/^\./, "");
  return {
    url: `https://${host}${c.path}`,
    name: c.name,
    value: c.value,
    // A leading dot marks a domain cookie. Without one the cookie is host-only, which
    // Electron expresses by omitting `domain` (and which `__Host-` cookies require).
    domain: c.domain.startsWith(".") ? c.domain : undefined,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    expirationDate: c.expires > 0 ? c.expires : undefined,
    sameSite: (c.sameSite && SAME_SITE[c.sameSite]) ?? "unspecified",
  };
}

export interface ChromeSignInDeps {
  findBrowser(): ChromiumBrowser | null;
  profileDir: string;
  openWindow(
    browser: ChromiumBrowser,
    profileDir: string,
    url: string,
  ): Promise<void>;
  readCookies(
    browser: ChromiumBrowser,
    profileDir: string,
  ): Promise<ProfileCookie[]>;
  /** Replaces the saved sessions for every site in `cookies` with these cookies. */
  importCookies(cookies: ProfileCookie[]): Promise<void>;
}

export interface ChromeSignIn {
  /** Name of the browser sign-in would use, or null when neither Chrome nor Edge exists. */
  browserName(): string | null;
  /** Opens the browser, waits for the user to close it, then imports its cookies. */
  signIn(): Promise<ChromeSignInResult>;
}

export function createChromeSignIn(deps: ChromeSignInDeps): ChromeSignIn {
  let running: Promise<ChromeSignInResult> | null = null;

  async function run(): Promise<ChromeSignInResult> {
    const browser = deps.findBrowser();
    if (!browser) {
      throw new Error(
        "Signing in with your browser needs Google Chrome or Microsoft Edge installed.",
      );
    }
    await deps.openWindow(browser, deps.profileDir, SIGN_IN_URL);
    // Partitioned (CHIPS) cookies belong to third-party embeds, not to the sites yt-dlp
    // fetches.
    const cookies = (await deps.readCookies(browser, deps.profileDir)).filter(
      (c) => c.partitionKey === undefined,
    );
    await deps.importCookies(cookies);
    return {
      browser: browser.name,
      imported: cookies.length,
      youtubeSignedIn: hasGoogleSession(cookies),
    };
  }

  return {
    browserName: () => deps.findBrowser()?.name ?? null,
    signIn() {
      // A second click while the window is open joins the same sign-in.
      running ??= run().finally(() => {
        running = null;
      });
      return running;
    },
  };
}
