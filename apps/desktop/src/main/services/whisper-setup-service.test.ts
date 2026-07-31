import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "@sift/db/testing";
import { getAsset, runMigrations, type SiftDatabase } from "@sift/db";
import { WhisperSetupService } from "./whisper-setup-service";

let root: string;
let db: SiftDatabase;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "sift-whisper-test-"));
  db = await openTestDatabase();
  runMigrations(db);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** A fetch that writes deterministic bytes for any url, so downloadAndVerify's sha check
 * is satisfied by matching the sha we hand the service. */
function fakeFetch(bytes: Buffer): typeof fetch {
  return (async () =>
    new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { "content-length": String(bytes.length) },
    })) as typeof fetch;
}

/** A fetch keyed by url, so the binary download and the model download (different
 * urls, hit by the same `fetchImpl`) can each return their own deterministic bytes. */
function fakeFetchByUrl(byUrl: Record<string, Buffer>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const bytes = byUrl[url];
    if (!bytes) throw new Error(`fakeFetchByUrl: no fixture for ${url}`);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { "content-length": String(bytes.length) },
    });
  }) as typeof fetch;
}

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

describe("WhisperSetupService (archive platform)", () => {
  it("installs binary (folder, siblings preserved) + model and reports status", async () => {
    const whisperDir = join(root, "binaries", "whisper");
    const modelsDir = join(root, "whisper-models");
    const archiveBytes = Buffer.from("archive-bytes");
    const modelBytes = Buffer.from("model-bytes");

    const svc = new WhisperSetupService({
      db,
      whisperDir,
      modelsDir,
      platform: "linux-x64",
      fetchImpl: fakeFetchByUrl({ "x://a": archiveBytes, "x://m": modelBytes }),
      // fake extract: drop the cli AND a sibling shared lib into destDir
      extract: async (_archivePath, destDir) => {
        mkdirSync(destDir, { recursive: true });
        writeFileSync(join(destDir, "whisper-cli"), "#!/bin/sh\n");
        writeFileSync(join(destDir, "libwhisper.so"), "lib");
      },
      // Injectable seams so the archive test stays offline+deterministic: the fake
      // fetch always returns `archiveBytes`/`modelBytes`, so the sha256 downloadAndVerify
      // checks against must be computed from those exact bytes rather than the real
      // pinned manifest values.
      resolveBinary: () => ({
        kind: "archive",
        assetUrl: "x://a",
        version: "v1.9.1",
        binaryName: "whisper-cli",
        sha256: sha256Hex(archiveBytes),
      }),
      model: {
        name: "ggml-small.bin",
        url: "x://m",
        sha256: sha256Hex(modelBytes),
        sizeBytes: modelBytes.length,
      },
    });

    const status = await svc.install();

    // status() resolves the stored (relative-to-dirname(whisperDir)) path back to
    // absolute before checking existsSync, so the freshly-installed binary reports
    // installed.
    expect(status.binaryInstalled).toBe(true);
    expect(status.binaryPath).toBe(join(whisperDir, "whisper-cli"));
    expect(existsSync(join(whisperDir, "whisper-cli"))).toBe(true);
    expect(existsSync(join(whisperDir, "libwhisper.so"))).toBe(true); // sibling kept
    // path is stored relative to dirname(whisperDir) (i.e. binariesDir); the fake
    // extract drops "whisper-cli" directly into whisperDir, so the relative path
    // retains the "whisper" folder segment: "whisper/whisper-cli".
    expect(getAsset(db, "whisper")?.path).toBe(join("whisper", "whisper-cli"));
    expect(status.modelInstalled).toBe(true);
    expect(readFileSync(status.modelPath!, "utf8")).toBe("model-bytes");
  });
});

describe("WhisperSetupService (homebrew platform)", () => {
  it("throws guidance when no whisper-cli is found", async () => {
    const svc = new WhisperSetupService({
      db,
      whisperDir: join(root, "w"),
      modelsDir: join(root, "m"),
      platform: "mac-arm64",
      findHomebrewCli: () => null,
    });
    await expect(svc.install()).rejects.toThrow(/brew install whisper-cpp/i);
  });

  it("registers the located Homebrew cli", async () => {
    const cli = join(root, "opt", "whisper-cli");
    mkdirSync(join(root, "opt"), { recursive: true });
    writeFileSync(cli, "");
    const modelBytes = Buffer.from("model-bytes");
    const svc = new WhisperSetupService({
      db,
      whisperDir: join(root, "w"),
      modelsDir: join(root, "m"),
      platform: "mac-arm64",
      findHomebrewCli: () => cli,
      fetchImpl: fakeFetch(modelBytes),
      model: {
        name: "ggml-small.bin",
        url: "x://m",
        sha256: sha256Hex(modelBytes),
        sizeBytes: modelBytes.length,
      },
    });
    const status = await svc.install();
    expect(getAsset(db, "whisper")?.path).toBe(cli);
    expect(status.binaryInstalled).toBe(true);
  });
});
