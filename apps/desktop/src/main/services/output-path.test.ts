import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveOutputPath } from "./output-path";

let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("resolveOutputPath", () => {
  it("uses the plain name when nothing is there", () => {
    dir = mkdtempSync(join(tmpdir(), "sift-out-"));
    expect(resolveOutputPath(dir, "Chan__Vid__Summary", "md", "text")).toBe(
      join(dir, "Chan__Vid__Summary.md"),
    );
  });

  it("reuses the file when the content is identical", () => {
    dir = mkdtempSync(join(tmpdir(), "sift-out-"));
    const first = join(dir, "Chan__Vid__Summary.md");
    writeFileSync(first, "same text", "utf8");
    expect(
      resolveOutputPath(dir, "Chan__Vid__Summary", "md", "same text"),
    ).toBe(first);
  });

  it("keeps the earlier export when the content differs", () => {
    dir = mkdtempSync(join(tmpdir(), "sift-out-"));
    writeFileSync(join(dir, "Chan__Vid__Summary.md"), "first run", "utf8");
    expect(
      resolveOutputPath(dir, "Chan__Vid__Summary", "md", "second run"),
    ).toBe(join(dir, "Chan__Vid__Summary (2).md"));

    writeFileSync(join(dir, "Chan__Vid__Summary (2).md"), "second run", "utf8");
    expect(
      resolveOutputPath(dir, "Chan__Vid__Summary", "md", "third run"),
    ).toBe(join(dir, "Chan__Vid__Summary (3).md"));
  });

  it("compares binary content too", () => {
    dir = mkdtempSync(join(tmpdir(), "sift-out-"));
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46]);
    const first = join(dir, "doc.pdf");
    writeFileSync(first, pdf);
    expect(resolveOutputPath(dir, "doc", "pdf", pdf)).toBe(first);
    expect(resolveOutputPath(dir, "doc", "pdf", Buffer.from([0x00]))).toBe(
      join(dir, "doc (2).pdf"),
    );
  });
});
