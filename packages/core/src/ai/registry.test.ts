import { describe, expect, it } from "vitest";
import { AiRegistry } from "./registry";
import type { AiProvider } from "./types";

function fake(id: string): AiProvider {
  return {
    id,
    label: id,
    needsKey: false,
    models: () => [],
    summarize: async () => "",
  };
}

describe("AiRegistry", () => {
  it("get returns a registered provider by id", () => {
    const r = new AiRegistry();
    r.register(fake("a"));
    r.register(fake("b"));
    expect(r.get("a")?.id).toBe("a");
    expect(r.get("b")?.id).toBe("b");
  });
  it("get returns undefined for an unregistered id", () => {
    const r = new AiRegistry();
    r.register(fake("a"));
    expect(r.get("missing")).toBeUndefined();
  });
  it("list returns all registered providers", () => {
    const r = new AiRegistry();
    r.register(fake("a"));
    r.register(fake("b"));
    expect(r.list().map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("re-registering the same id replaces in place (list length stays 2)", () => {
    const r = new AiRegistry();
    r.register(fake("a"));
    r.register(fake("b"));
    r.register(fake("a"));
    expect(r.list()).toHaveLength(2);
    expect(r.list().map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("unregister removes a registered provider by id", () => {
    const r = new AiRegistry();
    r.register(fake("a"));
    r.register(fake("b"));
    r.unregister("a");
    expect(r.get("a")).toBeUndefined();
    expect(r.list().map((p) => p.id)).toEqual(["b"]);
  });
  it("unregister leaves the registry empty when it was the only provider", () => {
    const r = new AiRegistry();
    r.register(fake("a"));
    r.unregister("a");
    expect(r.list()).toEqual([]);
  });
  it("unregister is a no-op for an id that was never registered", () => {
    const r = new AiRegistry();
    r.register(fake("a"));
    expect(() => r.unregister("missing")).not.toThrow();
    expect(r.list().map((p) => p.id)).toEqual(["a"]);
  });
});
