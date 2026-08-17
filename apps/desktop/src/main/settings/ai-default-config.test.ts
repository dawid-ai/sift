import { describe, expect, it } from "vitest";
import { createAiDefaultConfigStore } from "./ai-default-config";

function memFs() {
  const files = new Map<string, Buffer>();
  return {
    files,
    existsSync: (p: string) => files.has(p),
    readFileSync: (p: string) => files.get(p)!,
    writeFileSync: (p: string, d: Buffer) => void files.set(p, d),
    rmSync: (p: string) => void files.delete(p),
    mkdirSync: () => {},
  };
}

describe("createAiDefaultConfigStore", () => {
  it("returns null when unset and round-trips a set value", () => {
    const fs = memFs();
    const store = createAiDefaultConfigStore({ filePath: "ai.json", fs });
    expect(store.get()).toBeNull();
    store.set({ providerId: "claude-cli", model: "opus" });
    expect(
      createAiDefaultConfigStore({ filePath: "ai.json", fs }).get(),
    ).toEqual({
      providerId: "claude-cli",
      model: "opus",
    });
  });

  it("clears the file when set to null and ignores malformed json", () => {
    const fs = memFs();
    const store = createAiDefaultConfigStore({ filePath: "ai.json", fs });
    store.set({ providerId: "anthropic", model: "claude-opus-4-8" });
    store.set(null);
    expect(store.get()).toBeNull();
    fs.files.set("ai.json", Buffer.from("{ not json", "utf8"));
    expect(store.get()).toBeNull();
  });
});
