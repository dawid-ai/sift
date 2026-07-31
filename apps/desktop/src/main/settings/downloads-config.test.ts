import { expect, it } from "vitest";
import { createDownloadsConfigStore } from "./downloads-config";

function memFs(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  return {
    fs: {
      existsSync: (p: string) => files.has(p),
      readFileSync: (p: string) => Buffer.from(files.get(p) ?? ""),
      writeFileSync: (p: string, d: Buffer) => void files.set(p, d.toString("utf8")),
      rmSync: (p: string) => void files.delete(p),
      mkdirSync: () => {},
    },
    files,
  };
}
const DEF = "C:\\Users\\me\\Downloads\\Sift";

it("get() returns defaultDir when unset", () => {
  const { fs } = memFs();
  expect(createDownloadsConfigStore({ filePath: "cfg.json", defaultDir: DEF, fs }).get()).toBe(DEF);
});
it("set() then get() returns the stored path", () => {
  const { fs } = memFs();
  const store = createDownloadsConfigStore({ filePath: "cfg.json", defaultDir: DEF, fs });
  store.set("D:\\Media");
  expect(store.get()).toBe("D:\\Media");
});
it("get() falls back to defaultDir on corrupt/empty JSON", () => {
  const { fs } = memFs({ "cfg.json": "not json" });
  expect(createDownloadsConfigStore({ filePath: "cfg.json", defaultDir: DEF, fs }).get()).toBe(DEF);
});
it("get() falls back to defaultDir when stored path is empty", () => {
  const { fs } = memFs({ "cfg.json": JSON.stringify({ path: "" }) });
  expect(createDownloadsConfigStore({ filePath: "cfg.json", defaultDir: DEF, fs }).get()).toBe(DEF);
});
