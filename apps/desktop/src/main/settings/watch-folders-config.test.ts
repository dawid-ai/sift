import { expect, it } from "vitest";
import { createWatchFoldersStore } from "./watch-folders-config";

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
  };
}

const store = (initial?: Record<string, string>) =>
  createWatchFoldersStore({ filePath: "w.json", ...memFs(initial) });

it("starts empty", () => {
  expect(store().get()).toEqual({ folders: [], imported: [] });
});

it("round-trips folders, trimming and deduplicating", () => {
  const s = store();
  expect(
    s.setFolders([" C:/drop ", "C:/drop", "", "D:/other"]).folders,
  ).toEqual(["C:/drop", "D:/other"]);
  expect(s.get().folders).toEqual(["C:/drop", "D:/other"]);
});

it("remembers imported paths without duplicating them", () => {
  const s = store();
  s.markImported("C:/drop/a.mp4");
  s.markImported("C:/drop/a.mp4");
  expect(s.get().imported).toEqual(["C:/drop/a.mp4"]);
});

it("keeps the imported list across a folder change", () => {
  const s = store();
  s.markImported("C:/drop/a.mp4");
  s.setFolders(["D:/new"]);
  expect(s.get().imported).toEqual(["C:/drop/a.mp4"]);
});

it("falls back to empty on corrupt JSON and drops non-string entries", () => {
  expect(store({ "w.json": "{not json" }).get()).toEqual({
    folders: [],
    imported: [],
  });
  expect(
    store({
      "w.json": JSON.stringify({ folders: ["ok", 5, null], imported: "nope" }),
    }).get(),
  ).toEqual({ folders: ["ok"], imported: [] });
});
