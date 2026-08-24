import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { writeFileAtomicSync } from "../atomic-write";

// No `electron` import — stays Node-loadable for Vitest, mirroring downloads-config.ts.

/** Schemes yt-dlp and Chromium both understand. `socks5h` is yt-dlp-only (remote DNS) and is
 * deliberately excluded: it would silently fall back to direct in Chromium's proxy resolver,
 * so AI calls would leak while downloads went through the proxy. */
const SCHEMES = ["http", "https", "socks4", "socks5"];

/**
 * Validates a proxy URL and returns it normalized, or `""` for "no proxy".
 *
 * Throws on anything else — this value is interpolated into a yt-dlp `--proxy` argument and
 * into Chromium's `proxyRules`, so the scheme and host check is the trust boundary, not the
 * text field in Settings.
 */
export function normalizeProxyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(
      "Enter a full proxy URL, for example http://127.0.0.1:8080",
    );
  }
  const scheme = url.protocol.replace(/:$/, "");
  if (!SCHEMES.includes(scheme))
    throw new Error(`Proxy scheme must be one of: ${SCHEMES.join(", ")}`);
  if (url.hostname.length === 0) throw new Error("Proxy URL needs a host");
  // Rebuilt rather than passed through: drops any path/query/fragment a paste might carry,
  // which neither consumer accepts.
  const auth = url.username
    ? `${url.username}${url.password ? `:${url.password}` : ""}@`
    : "";
  return `${scheme}://${auth}${url.host}`;
}

export interface NetworkConfigDeps {
  filePath: string;
  fs?: {
    existsSync(p: string): boolean;
    readFileSync(p: string): Buffer;
    writeFileSync(p: string, d: Buffer): void;
    rmSync(p: string, opts: { force: boolean }): void;
    mkdirSync(p: string, opts: { recursive: boolean }): void;
  };
}
const defaultFs: NonNullable<NetworkConfigDeps["fs"]> = {
  existsSync,
  readFileSync,
  writeFileSync: writeFileAtomicSync,
  rmSync,
  mkdirSync,
};

/** Persisted proxy URL for yt-dlp and the remote AI providers. `""` means connect directly. */
export function createNetworkConfigStore(deps: NetworkConfigDeps): {
  get(): string;
  set(proxyUrl: string): string;
} {
  const { filePath } = deps;
  const fs = deps.fs ?? defaultFs;
  return {
    get(): string {
      if (!fs.existsSync(filePath)) return "";
      try {
        const parsed: unknown = JSON.parse(
          fs.readFileSync(filePath).toString("utf8"),
        );
        const p = (parsed as { proxyUrl?: unknown } | null)?.proxyUrl;
        // Re-validated on read: the file is user-editable, and a hand-edited bad value should
        // read as "no proxy" rather than reach yt-dlp's argv.
        return typeof p === "string" ? tryNormalize(p) : "";
      } catch {
        return "";
      }
    },
    set(proxyUrl: string): string {
      const normalized = normalizeProxyUrl(proxyUrl);
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        Buffer.from(JSON.stringify({ proxyUrl: normalized }), "utf8"),
      );
      return normalized;
    },
  };
}

function tryNormalize(raw: string): string {
  try {
    return normalizeProxyUrl(raw);
  } catch {
    return "";
  }
}
