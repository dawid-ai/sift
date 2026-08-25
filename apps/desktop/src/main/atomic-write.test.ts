import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomicSync } from "./atomic-write";

let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("writeFileAtomicSync", () => {
  it("creates the file and leaves no temp file behind", () => {
    dir = mkdtempSync(join(tmpdir(), "sift-atomic-"));
    const path = join(dir, "settings.json");
    writeFileAtomicSync(path, Buffer.from('{"a":1}', "utf8"));
    expect(readFileSync(path, "utf8")).toBe('{"a":1}');
    expect(readdirSync(dir)).toEqual(["settings.json"]);
  });

  it("replaces an existing file in one step", () => {
    dir = mkdtempSync(join(tmpdir(), "sift-atomic-"));
    const path = join(dir, "settings.json");
    writeFileAtomicSync(path, "old");
    writeFileAtomicSync(path, "new");
    expect(readFileSync(path, "utf8")).toBe("new");
    expect(readdirSync(dir)).toEqual(["settings.json"]);
  });

  it("cleans up the temp file and rethrows when the write fails", () => {
    dir = mkdtempSync(join(tmpdir(), "sift-atomic-"));
    // A directory that does not exist: openSync on the temp path throws.
    expect(() =>
      writeFileAtomicSync(join(dir, "missing", "settings.json"), "x"),
    ).toThrow();
    expect(readdirSync(dir)).toEqual([]);
  });
});
