import { expect, it } from "vitest";
import {
  createChannelRefreshStore,
  normalizeInterval,
} from "./channel-refresh-config";

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

it("defaults to off with new-video notifications on", () => {
  const { fs } = memFs();
  expect(createChannelRefreshStore({ filePath: "c.json", fs }).get()).toEqual({
    intervalMinutes: 0,
    notifyNewVideos: true,
    notifyOutliers: false,
  });
});

it("clamps an interval below the floor up to it, and keeps 0 as off", () => {
  expect(normalizeInterval(0)).toBe(0);
  expect(normalizeInterval(-5)).toBe(0);
  expect(normalizeInterval(1)).toBe(15);
  expect(normalizeInterval(60)).toBe(60);
  expect(normalizeInterval(999_999)).toBe(60 * 24 * 7);
  expect(normalizeInterval("hourly")).toBe(0);
  expect(normalizeInterval(Number.NaN)).toBe(0);
});

it("round-trips a saved config", () => {
  const { fs } = memFs();
  const store = createChannelRefreshStore({ filePath: "c.json", fs });
  const saved = store.set({
    intervalMinutes: 30,
    notifyNewVideos: false,
    notifyOutliers: true,
  });
  expect(saved.intervalMinutes).toBe(30);
  expect(store.get()).toEqual(saved);
});

it("normalizes on write, not only on read", () => {
  const { fs } = memFs();
  const store = createChannelRefreshStore({ filePath: "c.json", fs });
  expect(
    store.set({
      intervalMinutes: 2,
      notifyNewVideos: true,
      notifyOutliers: false,
    }).intervalMinutes,
  ).toBe(15);
});

it("falls back to defaults on corrupt JSON and on a bad field", () => {
  expect(
    createChannelRefreshStore({
      filePath: "c.json",
      ...memFs({ "c.json": "{not json" }),
    }).get().intervalMinutes,
  ).toBe(0);
  expect(
    createChannelRefreshStore({
      filePath: "c.json",
      ...memFs({
        "c.json": JSON.stringify({
          intervalMinutes: "soon",
          notifyNewVideos: "yes",
        }),
      }),
    }).get(),
  ).toEqual({
    intervalMinutes: 0,
    notifyNewVideos: true,
    notifyOutliers: false,
  });
});
