import { expect, it } from "vitest";
import { createBinaryUpdatesConfigStore } from "./binary-updates-config";

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

it("get() defaults to 'auto' when unset", () => {
  const { fs } = memFs();
  expect(
    createBinaryUpdatesConfigStore({ filePath: "cfg.json", fs }).get(),
  ).toBe("auto");
});
it("set('notify') then get() returns 'notify'", () => {
  const { fs } = memFs();
  const store = createBinaryUpdatesConfigStore({ filePath: "cfg.json", fs });
  store.set("notify");
  expect(store.get()).toBe("notify");
});
it("get() falls back to 'auto' on corrupt JSON", () => {
  const { fs } = memFs({ "cfg.json": "not json" });
  expect(
    createBinaryUpdatesConfigStore({ filePath: "cfg.json", fs }).get(),
  ).toBe("auto");
});
it("get() falls back to 'auto' on an unrecognized value", () => {
  const { fs } = memFs({ "cfg.json": JSON.stringify({ mode: "banana" }) });
  expect(
    createBinaryUpdatesConfigStore({ filePath: "cfg.json", fs }).get(),
  ).toBe("auto");
});
