import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { win32 } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createChromeSignIn,
  createMessageSplitter,
  findChromium,
  hasGoogleSession,
  readProfileCookies,
  SIGN_IN_URL,
  toSessionCookie,
  type ChromeSpawnFn,
  type ProfileCookie,
} from "./chrome-sign-in";

function cookie(over: Partial<ProfileCookie> = {}): ProfileCookie {
  return {
    name: "SID",
    value: "v",
    domain: ".youtube.com",
    path: "/",
    expires: 1_900_000_000,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    ...over,
  };
}

describe("findChromium", () => {
  const env = {
    ProgramFiles: "C:\\Program Files",
    "ProgramFiles(x86)": "C:\\Program Files (x86)",
    LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local",
  };
  const chrome = win32.join(
    "C:\\Program Files",
    "Google",
    "Chrome",
    "Application",
    "chrome.exe",
  );
  const edge = win32.join(
    "C:\\Program Files (x86)",
    "Microsoft",
    "Edge",
    "Application",
    "msedge.exe",
  );

  it("prefers Chrome over Edge on Windows", () => {
    const found = findChromium("win32", env, (p) => p === chrome || p === edge);
    expect(found).toEqual({ name: "Chrome", path: chrome });
  });

  it("falls back to Edge when Chrome isn't installed", () => {
    expect(findChromium("win32", env, (p) => p === edge)).toEqual({
      name: "Edge",
      path: edge,
    });
  });

  it("returns null when neither is installed", () => {
    expect(findChromium("win32", env, () => false)).toBeNull();
  });
});

describe("createMessageSplitter", () => {
  it("emits one message per NUL terminator, across chunk boundaries", () => {
    const seen: unknown[] = [];
    const feed = createMessageSplitter((m) => seen.push(m));
    feed('{"id":1}\0{"id"');
    feed(":2}\0");
    expect(seen).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

describe("hasGoogleSession", () => {
  it("is true only with an account cookie on google.com or youtube.com", () => {
    expect(hasGoogleSession([cookie()])).toBe(true);
    expect(hasGoogleSession([cookie({ domain: ".google.com" })])).toBe(true);
    expect(hasGoogleSession([cookie({ name: "VISITOR_INFO1_LIVE" })])).toBe(
      false,
    );
    expect(hasGoogleSession([cookie({ domain: ".notyoutube.com" })])).toBe(
      false,
    );
  });
});

describe("toSessionCookie", () => {
  it("keeps a domain cookie's domain and maps sameSite", () => {
    expect(toSessionCookie(cookie())).toEqual({
      url: "https://youtube.com/",
      name: "SID",
      value: "v",
      domain: ".youtube.com",
      path: "/",
      secure: true,
      httpOnly: true,
      expirationDate: 1_900_000_000,
      sameSite: "lax",
    });
  });

  it("omits domain for a host-only cookie and expiry for a session cookie", () => {
    const out = toSessionCookie(
      cookie({
        name: "__Host-x",
        domain: "www.youtube.com",
        expires: -1,
        sameSite: undefined,
      }),
    );
    expect(out.url).toBe("https://www.youtube.com/");
    expect(out.domain).toBeUndefined();
    expect(out.expirationDate).toBeUndefined();
    expect(out.sameSite).toBe("unspecified");
  });
});

describe("createChromeSignIn", () => {
  const browser = { name: "Chrome", path: "chrome.exe" };

  it("opens the sign-in page, then imports the profile's cookies minus partitioned ones", async () => {
    const openWindow = vi.fn(async () => {});
    const importCookies = vi.fn(async () => {});
    const signIn = createChromeSignIn({
      findBrowser: () => browser,
      profileDir: "/profile",
      openWindow,
      readCookies: async () => [
        cookie(),
        cookie({ name: "embed", partitionKey: { topLevelSite: "x" } }),
      ],
      importCookies,
    });
    await expect(signIn.signIn()).resolves.toEqual({
      browser: "Chrome",
      imported: 1,
      youtubeSignedIn: true,
    });
    expect(openWindow).toHaveBeenCalledWith(browser, "/profile", SIGN_IN_URL);
    expect(importCookies).toHaveBeenCalledWith([cookie()]);
  });

  it("joins a sign-in that is already in progress", async () => {
    let close!: () => void;
    const openWindow = vi.fn(() => new Promise<void>((r) => (close = r)));
    const signIn = createChromeSignIn({
      findBrowser: () => browser,
      profileDir: "/profile",
      openWindow,
      readCookies: async () => [],
      importCookies: async () => {},
    });
    const first = signIn.signIn();
    const second = signIn.signIn();
    expect(second).toBe(first);
    close();
    await first;
    expect(openWindow).toHaveBeenCalledTimes(1);
  });

  it("says which browsers it needs when none is installed", async () => {
    const signIn = createChromeSignIn({
      findBrowser: () => null,
      profileDir: "/profile",
      openWindow: async () => {},
      readCookies: async () => [],
      importCookies: async () => {},
    });
    expect(signIn.browserName()).toBeNull();
    await expect(signIn.signIn()).rejects.toThrow(/Chrome or Microsoft Edge/);
  });
});

/** A fake browser process speaking the `--remote-debugging-pipe` protocol. */
function fakeBrowser(
  behavior: "answer" | "exit-at-once",
  cookies: ProfileCookie[],
) {
  const proc = new EventEmitter() as EventEmitter & {
    stdio: unknown[];
    kill: () => boolean;
  };
  const toBrowser = new PassThrough();
  const fromBrowser = new PassThrough();
  proc.stdio = [null, null, null, toBrowser, fromBrowser];
  proc.kill = () => true;
  if (behavior === "exit-at-once") {
    setImmediate(() => proc.emit("exit", 0));
  } else {
    const feed = createMessageSplitter((m) => {
      const { id, method } = m as { id: number; method: string };
      const result = method === "Storage.getCookies" ? { cookies } : {};
      fromBrowser.write(`${JSON.stringify({ id, result })}\0`);
      if (method === "Browser.close") setImmediate(() => proc.emit("exit", 0));
    });
    toBrowser.on("data", feed);
  }
  return proc;
}

describe("readProfileCookies", () => {
  const browser = { name: "Chrome", path: "chrome.exe" };

  it("reads cookies headless over the debugging pipe", async () => {
    const spawn = vi.fn(() => fakeBrowser("answer", [cookie()]));
    const out = await readProfileCookies(browser, "/profile", {
      spawn: spawn as unknown as ChromeSpawnFn,
    });
    expect(out).toEqual([cookie()]);
    const args = (spawn.mock.calls[0] as unknown[])[1] as string[];
    expect(args).toContain("--headless=new");
    expect(args).toContain("--remote-debugging-pipe");
    expect(args).toContain("--user-data-dir=/profile");
  });

  it("retries while the profile is still locked by the closing window", async () => {
    const spawn = vi
      .fn()
      .mockImplementationOnce(() => fakeBrowser("exit-at-once", []))
      .mockImplementationOnce(() => fakeBrowser("answer", [cookie()]));
    const out = await readProfileCookies(browser, "/profile", {
      spawn: spawn as unknown as ChromeSpawnFn,
      retryDelayMs: 0,
    });
    expect(out).toEqual([cookie()]);
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it("gives up after the last attempt", async () => {
    const spawn = vi.fn(() => fakeBrowser("exit-at-once", []));
    await expect(
      readProfileCookies(browser, "/profile", {
        spawn: spawn as unknown as ChromeSpawnFn,
        attempts: 2,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/exited before returning cookies/);
    expect(spawn).toHaveBeenCalledTimes(2);
  });
});
