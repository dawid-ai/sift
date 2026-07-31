import { describe, expect, it } from "vitest";
import { createTranscriptConfigStore } from "./transcript-config";

function memFs(initial?: string) {
  const store: Record<string, Buffer> = {};
  if (initial !== undefined) store["/cfg.json"] = Buffer.from(initial, "utf8");
  return {
    fs: {
      existsSync: (p: string) => p in store,
      readFileSync: (p: string) => store[p]!,
      writeFileSync: (p: string, data: Buffer) => { store[p] = data; },
      rmSync: (p: string) => { delete store[p]; },
      mkdirSync: () => {},
    },
    read: () => store["/cfg.json"]?.toString("utf8"),
  };
}

describe("transcript-config store", () => {
  it("defaults to [en] when the file is absent", () => {
    const { fs } = memFs();
    expect(createTranscriptConfigStore({ filePath: "/cfg.json", fs }).get()).toEqual(["en"]);
  });
  it("round-trips an ordered list", () => {
    const { fs } = memFs();
    const store = createTranscriptConfigStore({ filePath: "/cfg.json", fs });
    store.set(["en", "pl"]);
    expect(store.get()).toEqual(["en", "pl"]);
  });
  it("normalizes to base codes and dedups on set", () => {
    const { fs } = memFs();
    const store = createTranscriptConfigStore({ filePath: "/cfg.json", fs });
    store.set(["EN-US", "pl", "en"]);
    expect(store.get()).toEqual(["en", "pl"]);
  });
  it("corrupt JSON → [en]", () => {
    const { fs } = memFs("{not json");
    expect(createTranscriptConfigStore({ filePath: "/cfg.json", fs }).get()).toEqual(["en"]);
  });
  it("empty/invalid set → [en]", () => {
    const { fs } = memFs();
    const store = createTranscriptConfigStore({ filePath: "/cfg.json", fs });
    store.set([]);
    expect(store.get()).toEqual(["en"]);
  });
});
