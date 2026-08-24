import { ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";
import {
  deleteChannelRule,
  getChannelRule,
  listChannelRules,
  upsertChannelRule,
  type SiftDatabase,
} from "@sift/db";
import type { ChannelScheduler } from "../services/channel-scheduler";
import type { ChannelRefreshConfig } from "../settings/channel-refresh-config";
import { bool, int, nonEmptyStr, obj, strArray } from "./validate";

const DAY = 86_400;

/** Registers `channelRules:*` and `channelRefresh:*`. Errors propagate. */
export function registerChannelRulesIpc(deps: {
  getDb: () => SiftDatabase;
  scheduler: () => ChannelScheduler;
  config: {
    get(): ChannelRefreshConfig;
    set(c: ChannelRefreshConfig): ChannelRefreshConfig;
  };
}): void {
  ipcMain.handle(IPC.channelRulesList, () => listChannelRules(deps.getDb()));

  ipcMain.handle(
    IPC.channelRulesGet,
    (_e, channelId: string) =>
      getChannelRule(deps.getDb(), nonEmptyStr(channelId, "channelId", 128)) ??
      null,
  );

  ipcMain.handle(IPC.channelRulesSet, (_e, raw: unknown) => {
    const r = obj(raw, "rule");
    const min =
      r.minDurationS == null
        ? null
        : int(r.minDurationS, "rule.minDurationS", 0, DAY * 30);
    const max =
      r.maxDurationS == null
        ? null
        : int(r.maxDurationS, "rule.maxDurationS", 0, DAY * 30);
    // A rule whose window is inverted matches nothing, silently. Reject it at the edge
    // rather than storing something that can only ever disappoint.
    if (min !== null && max !== null && min > max)
      throw new Error("The shortest length must not exceed the longest.");
    return upsertChannelRule(deps.getDb(), {
      channel_id: nonEmptyStr(r.channelId, "rule.channelId", 128),
      enabled: bool(r.enabled, "rule.enabled"),
      min_duration_s: min,
      max_duration_s: max,
      keywords: strArray(r.keywords ?? [], "rule.keywords", 50, 100),
      min_views:
        r.minViews == null
          ? null
          : int(r.minViews, "rule.minViews", 0, Number.MAX_SAFE_INTEGER),
      exclude_shorts: bool(r.excludeShorts ?? true, "rule.excludeShorts"),
    });
  });

  ipcMain.handle(IPC.channelRulesDelete, (_e, channelId: string) =>
    deleteChannelRule(deps.getDb(), nonEmptyStr(channelId, "channelId", 128)),
  );

  ipcMain.handle(IPC.channelRefreshGetConfig, () => deps.config.get());
  ipcMain.handle(IPC.channelRefreshSetConfig, (_e, raw: unknown) => {
    const c = obj(raw, "config");
    const saved = deps.config.set({
      intervalMinutes: int(
        c.intervalMinutes,
        "config.intervalMinutes",
        0,
        60 * 24 * 7,
      ),
      notifyNewVideos: bool(c.notifyNewVideos, "config.notifyNewVideos"),
      notifyOutliers: bool(c.notifyOutliers, "config.notifyOutliers"),
    });
    // Re-arm immediately, so a change takes effect without a restart.
    deps.scheduler().reschedule();
    return saved;
  });

  /** Runs a refresh now, whatever the schedule says. */
  ipcMain.handle(IPC.channelRefreshNow, () => deps.scheduler().tick());
}
