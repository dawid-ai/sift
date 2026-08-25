import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { writeFileAtomicSync } from "../atomic-write";

// No `electron` import — stays Node-loadable for Vitest, like the other settings stores.

export interface ChannelRefreshConfig {
  /** Minutes between automatic refreshes. 0 turns the schedule off. */
  intervalMinutes: number;
  notifyNewVideos: boolean;
  /** Notify when an upload's views are far above the channel's own median. */
  notifyOutliers: boolean;
}

const DEFAULT: ChannelRefreshConfig = {
  intervalMinutes: 0,
  notifyNewVideos: true,
  notifyOutliers: false,
};

/** Anything below this hammers the platform for no benefit — uploads are not that frequent. */
const MIN_INTERVAL = 15;
const MAX_INTERVAL = 60 * 24 * 7;

export interface ChannelRefreshConfigDeps {
  filePath: string;
  fs?: {
    existsSync(p: string): boolean;
    readFileSync(p: string): Buffer;
    writeFileSync(p: string, d: Buffer): void;
    rmSync(p: string, opts: { force: boolean }): void;
    mkdirSync(p: string, opts: { recursive: boolean }): void;
  };
}

const defaultFs: NonNullable<ChannelRefreshConfigDeps["fs"]> = {
  existsSync,
  readFileSync,
  writeFileSync: writeFileAtomicSync,
  rmSync,
  mkdirSync,
};

/** Clamps an interval to 0 (off) or the supported range. */
export function normalizeInterval(minutes: unknown): number {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return 0;
  const n = Math.round(minutes);
  if (n <= 0) return 0;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, n));
}

export function createChannelRefreshStore(deps: ChannelRefreshConfigDeps): {
  get(): ChannelRefreshConfig;
  set(config: ChannelRefreshConfig): ChannelRefreshConfig;
} {
  const { filePath } = deps;
  const fs = deps.fs ?? defaultFs;
  return {
    get(): ChannelRefreshConfig {
      if (!fs.existsSync(filePath)) return { ...DEFAULT };
      try {
        const parsed = JSON.parse(
          fs.readFileSync(filePath).toString("utf8"),
        ) as Partial<ChannelRefreshConfig> | null;
        return {
          intervalMinutes: normalizeInterval(parsed?.intervalMinutes),
          notifyNewVideos:
            typeof parsed?.notifyNewVideos === "boolean"
              ? parsed.notifyNewVideos
              : DEFAULT.notifyNewVideos,
          notifyOutliers:
            typeof parsed?.notifyOutliers === "boolean"
              ? parsed.notifyOutliers
              : DEFAULT.notifyOutliers,
        };
      } catch {
        return { ...DEFAULT };
      }
    },
    set(config: ChannelRefreshConfig): ChannelRefreshConfig {
      const normalized: ChannelRefreshConfig = {
        intervalMinutes: normalizeInterval(config.intervalMinutes),
        notifyNewVideos: !!config.notifyNewVideos,
        notifyOutliers: !!config.notifyOutliers,
      };
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        Buffer.from(JSON.stringify(normalized), "utf8"),
      );
      return normalized;
    },
  };
}
