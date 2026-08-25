import { statSync } from "node:fs";
import { homedir, release, totalmem, type } from "node:os";

// Node-loadable: no `electron` import. Everything environment-specific is injected by
// `index.ts`, which is also what keeps this unit-testable.

/**
 * A privacy-preserving snapshot of the running install, for a bug report.
 *
 * What is deliberately NOT collected, and must stay that way: API keys, cookies or any
 * auth state, transcript or summary text, media titles, and source URLs. A support bundle
 * gets attached to public issues — anything identifying a user or their library does not
 * belong in one. Paths are included only after `redactPath` strips the home directory,
 * which on Windows carries the account name.
 */
export interface DiagnosticsReport {
  generatedAt: string;
  app: { version: string; packaged: boolean; locale: string };
  runtime: {
    electron: string;
    chrome: string;
    node: string;
    v8: string;
    arch: string;
  };
  os: { type: string; release: string; totalMemMb: number };
  display: { width: number; height: number; scaleFactor: number } | null;
  paths: { userData: string; downloads: string };
  storage: {
    databaseBytes: number | null;
    downloadsFreeBytes: number | null;
  };
  binaries: { name: string; installed: boolean; version: string | null }[];
  library: {
    media: number;
    downloads: number;
    transcripts: number;
    summaries: number;
    frames: number;
  } | null;
  security: { secureStorageAvailable: boolean; keyedProviders: string[] };
  settings: Record<string, unknown>;
  recentEvents: DiagnosticEvent[];
}

export interface DiagnosticEvent {
  at: string;
  level: "warn" | "error";
  message: string;
}

/** Replaces the user's home directory with `~`, so a path stays useful for debugging
 * without naming the account it belongs to. */
export function redactPath(path: string, home = homedir()): string {
  if (!path) return path;
  const normalized = path.replace(/\\/g, "/");
  const homeNormalized = home.replace(/\\/g, "/");
  return normalized.toLowerCase().startsWith(homeNormalized.toLowerCase())
    ? "~" + normalized.slice(homeNormalized.length)
    : normalized;
}

/** Bytes of the file at `path`, or null if it isn't there. */
function sizeOf(path: string): number | null {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}

export interface DiagnosticsDeps {
  appVersion: () => string;
  isPackaged: () => boolean;
  locale: () => string;
  versions: () => NodeJS.ProcessVersions & {
    electron?: string;
    chrome?: string;
  };
  userDataDir: () => string;
  downloadsDir: () => string;
  databaseFile: () => string;
  primaryDisplay: () => {
    width: number;
    height: number;
    scaleFactor: number;
  } | null;
  freeDiskBytes: (path: string) => number | null;
  binaries: () => {
    name: string;
    installed: boolean;
    version: string | null;
  }[];
  libraryCounts: () => DiagnosticsReport["library"];
  secureStorageAvailable: () => boolean;
  keyedProviders: () => string[];
  /** Non-secret settings only. The caller decides what belongs here. */
  settings: () => Record<string, unknown>;
  /** How many recent warn/error events to keep. */
  ringSize?: number;
}

export interface Diagnostics {
  /** Records one warn/error for the bundle. Messages are truncated; never pass user text. */
  record(level: DiagnosticEvent["level"], message: string): void;
  report(): DiagnosticsReport;
}

const MAX_MESSAGE_CHARS = 500;

export function createDiagnostics(deps: DiagnosticsDeps): Diagnostics {
  const ringSize = deps.ringSize ?? 100;
  const events: DiagnosticEvent[] = [];

  return {
    record(level, message): void {
      events.push({
        at: new Date().toISOString(),
        level,
        // Paths leak the account name even inside an error string, so redact first.
        message: redactPath(String(message)).slice(0, MAX_MESSAGE_CHARS),
      });
      if (events.length > ringSize) events.splice(0, events.length - ringSize);
    },

    report(): DiagnosticsReport {
      const v = deps.versions();
      const userData = deps.userDataDir();
      const downloads = deps.downloadsDir();
      return {
        generatedAt: new Date().toISOString(),
        app: {
          version: deps.appVersion(),
          packaged: deps.isPackaged(),
          locale: deps.locale(),
        },
        runtime: {
          electron: v.electron ?? "unknown",
          chrome: v.chrome ?? "unknown",
          node: v.node,
          v8: v.v8,
          arch: process.arch,
        },
        os: {
          type: type(),
          release: release(),
          totalMemMb: Math.round(totalmem() / (1024 * 1024)),
        },
        display: deps.primaryDisplay(),
        paths: {
          userData: redactPath(userData),
          downloads: redactPath(downloads),
        },
        storage: {
          databaseBytes: sizeOf(deps.databaseFile()),
          downloadsFreeBytes: deps.freeDiskBytes(downloads),
        },
        binaries: deps.binaries(),
        library: deps.libraryCounts(),
        security: {
          secureStorageAvailable: deps.secureStorageAvailable(),
          keyedProviders: deps.keyedProviders(),
        },
        settings: deps.settings(),
        recentEvents: [...events],
      };
    },
  };
}
