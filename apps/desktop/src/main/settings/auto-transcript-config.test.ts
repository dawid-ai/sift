import { describe, expect, it } from "vitest";
import { createAutoTranscriptStore } from "./auto-transcript-config";

function memFs(seed?: string) {
  const files = new Map<string, Buffer>();
  if (seed !== undefined) files.set("/cfg/auto.json", Buffer.from(seed));
  return {
    files,
    fs: {
      existsSync: (p: string) => files.has(p),
      readFileSync: (p: string) => files.get(p)!,
      writeFileSync: (p: string, d: Buffer) => void files.set(p, d),
      rmSync: (p: string) => void files.delete(p),
      mkdirSync: () => {},
    },
  };
}

describe("auto-transcript config store", () => {
  it("defaults to true when no file exists", () => {
    const { fs } = memFs();
    expect(
      createAutoTranscriptStore({ filePath: "/cfg/auto.json", fs }).get(),
    ).toBe(true);
  });

  it("round-trips a set value", () => {
    const { fs } = memFs();
    const store = createAutoTranscriptStore({ filePath: "/cfg/auto.json", fs });
    store.set(false);
    expect(store.get()).toBe(false);
    store.set(true);
    expect(store.get()).toBe(true);
  });

  it("falls back to true on malformed or missing-key JSON", () => {
    expect(
      createAutoTranscriptStore({
        filePath: "/cfg/auto.json",
        fs: memFs("not json").fs,
      }).get(),
    ).toBe(true);
    expect(
      createAutoTranscriptStore({
        filePath: "/cfg/auto.json",
        fs: memFs("{}").fs,
      }).get(),
    ).toBe(true);
  });
});
