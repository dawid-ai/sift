import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearDir, dirSize, formatBytes } from "./storage-usage";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sift-storage-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function file(relative: string, bytes: number): void {
  const path = join(root, relative);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, Buffer.alloc(bytes));
}

describe("dirSize", () => {
  it("sums files across nested directories", async () => {
    file("a.bin", 100);
    file("sub/b.bin", 250);
    file("sub/deep/c.bin", 1);
    expect(await dirSize(root)).toBe(351);
  });

  it("reads a missing directory as zero rather than throwing", async () => {
    expect(await dirSize(join(root, "nope"))).toBe(0);
  });

  it("is zero for an empty directory", async () => {
    mkdirSync(join(root, "empty"));
    expect(await dirSize(join(root, "empty"))).toBe(0);
  });
});

describe("clearDir", () => {
  it("empties the directory, keeps it, and reports the bytes freed", async () => {
    file("a.bin", 100);
    file("sub/b.bin", 200);
    const freed = await clearDir(root);
    expect(freed).toBe(300);
    expect(existsSync(root)).toBe(true);
    expect(readdirSync(root)).toEqual([]);
  });

  it("is a no-op on a missing directory", async () => {
    expect(await clearDir(join(root, "nope"))).toBe(0);
  });
});

describe("formatBytes", () => {
  it("scales through the units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(20 * 1024 * 1024)).toBe("20 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });

  it("treats junk as zero", () => {
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
  });
});
