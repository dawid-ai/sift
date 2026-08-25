import { describe, expect, it } from "vitest";
import {
  createDiagnostics,
  redactPath,
  type DiagnosticsDeps,
} from "./diagnostics";

function deps(overrides: Partial<DiagnosticsDeps> = {}): DiagnosticsDeps {
  return {
    appVersion: () => "1.2.3",
    isPackaged: () => true,
    locale: () => "en-GB",
    versions: () => process.versions,
    userDataDir: () => "C:/Users/someone/AppData/Roaming/Sift",
    downloadsDir: () => "C:/Users/someone/Downloads/Sift",
    databaseFile: () => "C:/Users/someone/AppData/Roaming/Sift/sift.db",
    primaryDisplay: () => ({ width: 2560, height: 1440, scaleFactor: 1.5 }),
    freeDiskBytes: () => 123_456_789,
    binaries: () => [{ name: "ytdlp", installed: true, version: "2026.01.01" }],
    libraryCounts: () => ({
      media: 3,
      downloads: 4,
      transcripts: 2,
      summaries: 1,
      frames: 0,
    }),
    secureStorageAvailable: () => true,
    keyedProviders: () => ["anthropic"],
    settings: () => ({ transcriptMethod: "auto" }),
    ...overrides,
  };
}

describe("redactPath", () => {
  it("replaces the home directory, which carries the account name", () => {
    const win = "C:\\Users\\dawid\\Downloads\\x.mp4";
    expect(redactPath(win, "C:\\Users\\dawid")).toBe("~/Downloads/x.mp4");
  });

  it("leaves a path outside the home directory alone", () => {
    expect(redactPath("D:/media/x.mp4", "C:/Users/dawid")).toBe(
      "D:/media/x.mp4",
    );
  });
});

describe("createDiagnostics", () => {
  it("reports the environment without any credential or user content", () => {
    const report = createDiagnostics(deps()).report();
    expect(report.app.version).toBe("1.2.3");
    expect(report.display?.scaleFactor).toBe(1.5);
    expect(report.library?.media).toBe(3);
    expect(report.security.keyedProviders).toEqual(["anthropic"]);
    // A provider is named; a key never is.
    expect(JSON.stringify(report)).not.toMatch(/sk-|api[_-]?key/i);
  });

  it("keeps the most recent events and drops the oldest", () => {
    const d = createDiagnostics(deps({ ringSize: 3 }));
    for (const n of [1, 2, 3, 4]) d.record("warn", `event ${n}`);
    const messages = d.report().recentEvents.map((e) => e.message);
    expect(messages).toEqual(["event 2", "event 3", "event 4"]);
  });

  it("redacts a home path that appears inside a recorded message", () => {
    const d = createDiagnostics(deps());
    d.record(
      "error",
      `ENOENT: ${process.env.HOME ?? process.env.USERPROFILE}/x`,
    );
    expect(d.report().recentEvents[0]!.message.startsWith("ENOENT:")).toBe(
      true,
    );
  });
});
