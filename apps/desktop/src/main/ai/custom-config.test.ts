import { describe, expect, it } from "vitest";
import {
  createCustomConfigStore,
  type CustomConfigDeps,
} from "./custom-config";

/** In-memory fake for the injectable `fs` seam, backed by a `Map<string, Buffer>`. */
function makeFakeFs(): {
  fs: NonNullable<CustomConfigDeps["fs"]>;
  store: Map<string, Buffer>;
} {
  const store = new Map<string, Buffer>();
  const fs: NonNullable<CustomConfigDeps["fs"]> = {
    existsSync: (p) => store.has(p),
    readFileSync: (p) => {
      const data = store.get(p);
      if (!data) throw new Error(`ENOENT: no such file, open '${p}'`);
      return data;
    },
    writeFileSync: (p, data) => {
      store.set(p, data);
    },
    rmSync: (p) => {
      store.delete(p);
    },
    mkdirSync: () => {
      // no-op: the fake fs has no real directories to create
    },
  };
  return { fs, store };
}

describe("createCustomConfigStore", () => {
  it("get() returns null before any config is stored", () => {
    const { fs } = makeFakeFs();
    const store = createCustomConfigStore({
      filePath: "/fake/secrets/custom-config.json",
      fs,
    });

    expect(store.get()).toBe(null);
  });

  it("set() then get() round-trips the non-secret config", () => {
    const { fs } = makeFakeFs();
    const store = createCustomConfigStore({
      filePath: "/fake/secrets/custom-config.json",
      fs,
    });

    store.set({ baseUrl: "http://x/v1", model: "m" });

    expect(store.get()).toEqual({ baseUrl: "http://x/v1", model: "m" });
  });

  it("clear() removes the stored config", () => {
    const { fs } = makeFakeFs();
    const store = createCustomConfigStore({
      filePath: "/fake/secrets/custom-config.json",
      fs,
    });

    store.set({ baseUrl: "http://x/v1", model: "m" });
    store.clear();

    expect(store.get()).toBe(null);
  });

  it("get() returns null (does not throw) when the stored file is malformed JSON", () => {
    const { fs, store: rawStore } = makeFakeFs();
    // Seed a corrupt blob directly, mirroring secrets.test.ts's "corrupt-blob" case.
    rawStore.set(
      "/fake/secrets/custom-config.json",
      Buffer.from("{not valid json"),
    );
    const store = createCustomConfigStore({
      filePath: "/fake/secrets/custom-config.json",
      fs,
    });

    expect(() => store.get()).not.toThrow();
    expect(store.get()).toBe(null);
  });

  it("get() returns null when the stored JSON is valid but not a CustomConfig shape", () => {
    const { fs, store: rawStore } = makeFakeFs();
    rawStore.set(
      "/fake/secrets/custom-config.json",
      Buffer.from(JSON.stringify({ foo: "bar" })),
    );
    const store = createCustomConfigStore({
      filePath: "/fake/secrets/custom-config.json",
      fs,
    });

    expect(store.get()).toBe(null);
  });
});
