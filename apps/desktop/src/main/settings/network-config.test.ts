import { expect, it } from "vitest";
import { createNetworkConfigStore, normalizeProxyUrl } from "./network-config";

function memFs(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  return {
    fs: {
      existsSync: (p: string) => files.has(p),
      readFileSync: (p: string) => Buffer.from(files.get(p) ?? ""),
      writeFileSync: (p: string, d: Buffer) =>
        void files.set(p, d.toString("utf8")),
      rmSync: (p: string) => void files.delete(p),
      mkdirSync: () => {},
    },
    files,
  };
}

it("normalizeProxyUrl accepts the supported schemes", () => {
  expect(normalizeProxyUrl("http://127.0.0.1:8080")).toBe(
    "http://127.0.0.1:8080",
  );
  expect(normalizeProxyUrl("socks5://localhost:1080")).toBe(
    "socks5://localhost:1080",
  );
  expect(normalizeProxyUrl("https://proxy.example.com:3128")).toBe(
    "https://proxy.example.com:3128",
  );
});

it("normalizeProxyUrl treats blank as no proxy", () => {
  expect(normalizeProxyUrl("")).toBe("");
  expect(normalizeProxyUrl("   ")).toBe("");
});

it("normalizeProxyUrl keeps credentials but drops path and query", () => {
  expect(normalizeProxyUrl("http://user:pw@10.0.0.1:8080/ignored?x=1")).toBe(
    "http://user:pw@10.0.0.1:8080",
  );
});

it("normalizeProxyUrl rejects unsupported schemes and junk", () => {
  // socks5h is yt-dlp-only; accepting it would proxy downloads but not AI calls.
  expect(() => normalizeProxyUrl("socks5h://localhost:1080")).toThrow();
  expect(() => normalizeProxyUrl("file:///etc/passwd")).toThrow();
  expect(() => normalizeProxyUrl("127.0.0.1:8080")).toThrow();
  expect(() => normalizeProxyUrl("--flag")).toThrow();
});

it("get() returns empty when unset", () => {
  const { fs } = memFs();
  expect(createNetworkConfigStore({ filePath: "cfg.json", fs }).get()).toBe("");
});

it("set() then get() round-trips a normalized URL", () => {
  const { fs } = memFs();
  const store = createNetworkConfigStore({ filePath: "cfg.json", fs });
  expect(store.set(" http://127.0.0.1:8080/ ")).toBe("http://127.0.0.1:8080");
  expect(store.get()).toBe("http://127.0.0.1:8080");
});

it("set() rejects an invalid URL and leaves the stored value alone", () => {
  const { fs } = memFs();
  const store = createNetworkConfigStore({ filePath: "cfg.json", fs });
  store.set("http://127.0.0.1:8080");
  expect(() => store.set("ftp://nope")).toThrow();
  expect(store.get()).toBe("http://127.0.0.1:8080");
});

it("get() reads a hand-edited bad value as no proxy", () => {
  const { fs } = memFs({ "cfg.json": JSON.stringify({ proxyUrl: "--oops" }) });
  expect(createNetworkConfigStore({ filePath: "cfg.json", fs }).get()).toBe("");
});

it("get() survives corrupt JSON", () => {
  const { fs } = memFs({ "cfg.json": "{not json" });
  expect(createNetworkConfigStore({ filePath: "cfg.json", fs }).get()).toBe("");
});
