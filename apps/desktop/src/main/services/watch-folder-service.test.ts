import { beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { WatchFolderService } from "./watch-folder-service";

/** The service builds paths with `path.join`, so the fake filesystem must key on the same
 * separator — on Windows that is a backslash, and hard-coded p("x.mp4") keys never match. */
const p = (name: string, folder = "/watch") => join(folder, name);

interface FakeFile {
  size: number;
  isDir?: boolean;
}

let files: Map<string, FakeFile>;
let seen: Set<string>;
let imported: string[];
let errors: string[];
let failOn: Set<string>;

function fakeFs() {
  return {
    existsSync: (path: string) => path === "/watch" || files.has(path),
    // Keys are built with `path.join`, so the prefix has to be too — comparing against a
    // hard-coded "/watch/" matches nothing on Windows.
    readdirSync: (dir: string) => {
      const prefix = join(dir, "x").slice(0, -1);
      return (
        [...files.keys()]
          .filter((k) => k.startsWith(prefix))
          .map((k) => k.slice(prefix.length))
          // Direct children only, like the real readdirSync — returning "sub/inner.mp4" as a
          // name would make a non-recursive scan look recursive.
          .filter((name) => !name.includes("/") && !name.includes("\\"))
      );
    },
    statSync: (path: string) => {
      const f = files.get(path);
      if (!f) throw new Error("ENOENT");
      return { size: f.size, isFile: () => !f.isDir };
    },
  };
}

function service(folders = ["/watch"]) {
  return new WatchFolderService({
    folders: () => folders,
    importFile: async (path) => {
      if (failOn.has(path)) throw new Error("bad file");
      imported.push(path);
    },
    seen: () => seen,
    markSeen: (p) => seen.add(p),
    fs: fakeFs(),
    onError: (m) => errors.push(m),
  });
}

/** A file is only imported once its size has stopped changing, so most tests need two scans. */
async function settle(s: WatchFolderService) {
  await s.scan();
  return s.scan();
}

beforeEach(() => {
  files = new Map();
  seen = new Set();
  imported = [];
  errors = [];
  failOn = new Set();
});

describe("scan", () => {
  it("imports a media file whose size has settled", async () => {
    files.set(p("talk.mp4"), { size: 100 });
    const s = service();
    // First scan only records the size.
    expect(await s.scan()).toEqual([]);
    expect(await s.scan()).toEqual([p("talk.mp4")]);
    expect(imported).toEqual([p("talk.mp4")]);
  });

  it("skips a file that is still growing, then takes it once it stops", async () => {
    files.set(p("big.mp4"), { size: 100 });
    const s = service();
    await s.scan();
    files.set(p("big.mp4"), { size: 500 });
    expect(await s.scan()).toEqual([]);
    files.set(p("big.mp4"), { size: 500 });
    expect(await s.scan()).toEqual([p("big.mp4")]);
  });

  it("ignores non-media files and empty files", async () => {
    files.set(p("notes.txt"), { size: 100 });
    files.set(p("archive.zip"), { size: 100 });
    files.set(p("empty.mp4"), { size: 0 });
    await settle(service());
    expect(imported).toEqual([]);
  });

  it("ignores directories", async () => {
    files.set(p("nested.mp4"), { size: 100, isDir: true });
    await settle(service());
    expect(imported).toEqual([]);
  });

  it("does not recurse — a watch folder is a drop box, not a library scan", async () => {
    files.set(join("/watch", "sub", "inner.mp4"), { size: 100 });
    await settle(service());
    // "sub/inner.mp4" is not a media extension as a name, and is never descended into.
    expect(imported).toEqual([]);
  });

  it("never imports the same path twice", async () => {
    files.set(p("talk.mp4"), { size: 100 });
    const s = service();
    await settle(s);
    await s.scan();
    await s.scan();
    expect(imported).toEqual([p("talk.mp4")]);
  });

  it("skips what a previous session already imported", async () => {
    files.set(p("talk.mp4"), { size: 100 });
    seen.add(p("talk.mp4"));
    await settle(service());
    expect(imported).toEqual([]);
  });

  it("does not retry a file the importer rejected", async () => {
    files.set(p("broken.mp4"), { size: 100 });
    failOn.add(p("broken.mp4"));
    const s = service();
    await settle(s);
    expect(imported).toEqual([]);
    expect(errors[0]).toContain("Import failed");

    // Marked seen despite the failure, so the next scan leaves it alone.
    errors = [];
    await s.scan();
    expect(errors).toEqual([]);
  });

  it("carries on when one folder is unreadable", async () => {
    files.set(p("talk.mp4"), { size: 100 });
    const s = new WatchFolderService({
      folders: () => ["/missing", "/watch"],
      importFile: async (path) => {
        imported.push(path);
      },
      seen: () => seen,
      markSeen: (p) => seen.add(p),
      fs: {
        existsSync: () => true,
        readdirSync: (dir: string) => {
          if (dir === "/missing") throw new Error("EACCES");
          return fakeFs().readdirSync(dir);
        },
        statSync: fakeFs().statSync,
      },
      onError: (m) => errors.push(m),
    });
    await settle(s);
    expect(imported).toEqual([p("talk.mp4")]);
    expect(errors.some((e) => e.includes("/missing"))).toBe(true);
  });

  it("handles several files in one scan", async () => {
    files.set(p("a.mp4"), { size: 1 });
    files.set(p("b.mkv"), { size: 2 });
    files.set(p("c.m4a"), { size: 3 });
    await settle(service());
    expect(imported.sort()).toEqual([p("a.mp4"), p("b.mkv"), p("c.m4a")]);
  });

  it("drops a re-entrant scan rather than importing twice", async () => {
    files.set(p("talk.mp4"), { size: 100 });
    const s = service();
    await s.scan();
    const [a, b] = await Promise.all([s.scan(), s.scan()]);
    expect([...a, ...b]).toEqual([p("talk.mp4")]);
  });

  it("stops cleanly without watchers attached", () => {
    const s = service();
    expect(() => s.stop()).not.toThrow();
  });
});
