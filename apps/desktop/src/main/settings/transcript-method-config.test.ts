import { expect, it } from "vitest";
import { createTranscriptMethodStore } from "./transcript-method-config";

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

it("defaults to auto when unset", () => {
  const { fs } = memFs();
  expect(createTranscriptMethodStore({ filePath: "cfg.json", fs }).get()).toBe(
    "auto",
  );
});

it("set then get round-trips a valid method", () => {
  const { fs } = memFs();
  const store = createTranscriptMethodStore({ filePath: "cfg.json", fs });
  store.set("prefer_whisper");
  expect(store.get()).toBe("prefer_whisper");
});

it("falls back to auto on corrupt json or invalid value", () => {
  const { fs: fsCorrupt } = memFs({ "cfg.json": "not json" });
  expect(
    createTranscriptMethodStore({ filePath: "cfg.json", fs: fsCorrupt }).get(),
  ).toBe("auto");

  const { fs: fsValid } = memFs({
    "cfg.json": JSON.stringify({ method: "captions_only" }),
  });
  expect(
    createTranscriptMethodStore({ filePath: "cfg.json", fs: fsValid }).get(),
  ).toBe("captions_only");

  const { fs: fsInvalid } = memFs({
    "cfg.json": JSON.stringify({ method: "garbage" }),
  });
  expect(
    createTranscriptMethodStore({ filePath: "cfg.json", fs: fsInvalid }).get(),
  ).toBe("auto");
});
