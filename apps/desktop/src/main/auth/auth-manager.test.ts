import { describe, expect, it, vi } from "vitest";
import { createAuthManager, type ManagerCookie } from "./auth-manager";

const jar: ManagerCookie[] = [
  { domain: ".youtube.com", path: "/", secure: true, expirationDate: 4102444800, name: "SID", value: "v" },
  { domain: "accounts.google.com", path: "/", secure: true, name: "GAPS", value: "g" },
  { domain: ".vimeo.com", path: "/", secure: true, name: "vuid", value: "z" },
];

function makeManager(over: Partial<Parameters<typeof createAuthManager>[0]> = {}) {
  const writes: Record<string, string> = {};
  const removedDomains: string[] = [];
  const mgr = createAuthManager({
    readAllCookies: async () => jar,
    removeCookiesForDomain: async (d) => { removedDomains.push(d); },
    openBrowser: async () => {},
    cookiesPath: () => "/cookies/auth.txt",
    writeFile: (p, data) => { writes[p] = data; },
    removeFile: () => {},
    ...over,
  });
  return { mgr, writes, removedDomains };
}

describe("auth manager (generic)", () => {
  it("listSites groups cookies by registrable domain, deduped + sorted", async () => {
    const { mgr } = makeManager();
    const sites = await mgr.listSites();
    expect(sites.map((s) => s.domain)).toEqual(["google.com", "vimeo.com", "youtube.com"]);
    expect(sites.every((s) => s.expired === false)).toBe(true);
  });

  it("cookiesFileForUrl exports the WHOLE jar (ignoring the url) and returns the path", async () => {
    const { mgr, writes } = makeManager();
    const a = await mgr.cookiesFileForUrl("https://www.youtube.com/watch?v=x");
    const b = await mgr.cookiesFileForUrl("https://vimeo.com/123");
    expect(a).toBe("/cookies/auth.txt");
    expect(b).toBe("/cookies/auth.txt");
    expect(writes["/cookies/auth.txt"]).toContain("SID");
    expect(writes["/cookies/auth.txt"]).toContain("vuid"); // both sites present regardless of url
  });

  it("cookiesFileForUrl returns null AND deletes the stale export when the jar is empty", async () => {
    const removed: string[] = [];
    const mgr = createAuthManager({
      readAllCookies: async () => [],
      removeCookiesForDomain: async () => {},
      openBrowser: async () => {},
      cookiesPath: () => "/cookies/auth.txt",
      writeFile: () => {},
      removeFile: (p) => { removed.push(p); },
    });
    expect(await mgr.cookiesFileForUrl("https://www.youtube.com/x")).toBeNull();
    expect(removed).toEqual(["/cookies/auth.txt"]); // no lingering session tokens on disk
  });

  it("removeSite clears that domain's cookies", async () => {
    const { mgr, removedDomains } = makeManager();
    await mgr.removeSite("youtube.com");
    expect(removedDomains).toEqual(["youtube.com"]);
  });

  it("reportAuthFailure flags the url's registrable domain → listSites shows expired", async () => {
    const { mgr } = makeManager();
    mgr.reportAuthFailure("https://www.youtube.com/watch?v=x");
    const yt = (await mgr.listSites()).find((s) => s.domain === "youtube.com");
    expect(yt?.expired).toBe(true);
  });

  it("reportAuthFailure ignores an unparseable url", async () => {
    const { mgr } = makeManager();
    expect(() => mgr.reportAuthFailure("not a url")).not.toThrow();
  });

  it("openBrowser delegates to the injected opener", async () => {
    const openBrowser = vi.fn(async () => {});
    const { mgr } = makeManager({ openBrowser });
    await mgr.openBrowser();
    expect(openBrowser).toHaveBeenCalledOnce();
  });
});
