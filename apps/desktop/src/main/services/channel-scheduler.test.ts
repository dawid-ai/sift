import { beforeEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "@sift/db/testing";
import {
  runMigrations,
  upsertChannel,
  upsertChannelRule,
  getChannelRule,
  type SiftDatabase,
} from "@sift/db";
import type { QueueSpec } from "@sift/ipc-contract";
import {
  ChannelScheduler,
  type SchedulerNotification,
  type SchedulerVideo,
} from "./channel-scheduler";

let db: SiftDatabase;
let enqueued: { urls: string[] }[];
let notifications: SchedulerNotification[];
let videos: SchedulerVideo[];
let refreshCount: number;

const SPEC = {} as QueueSpec;

function video(over: Partial<SchedulerVideo> = {}): SchedulerVideo {
  return {
    externalId: "v1",
    url: "https://y/v1",
    title: "A long talk about rust",
    durationSec: 1800,
    viewCount: 10_000,
    isShort: false,
    ...over,
  };
}

function channel(channelId = "UC1") {
  return upsertChannel(db, {
    channel_id: channelId,
    url: `https://youtube.com/${channelId}`,
    handle: null,
    title: "The Channel",
    description: null,
    uploader: null,
    avatar_url: null,
    banner_url: null,
    follower_count: null,
    video_count: null,
    last_seen_video_id: null,
    new_count: 0,
    last_checked: null,
  });
}

function rule(over = {}) {
  return upsertChannelRule(db, {
    channel_id: "UC1",
    enabled: true,
    min_duration_s: null,
    max_duration_s: null,
    keywords: [],
    min_views: null,
    exclude_shorts: false,
    ...over,
  });
}

function scheduler(
  config: Partial<ReturnType<ChannelSchedulerDepsConfig>> = {},
) {
  return new ChannelScheduler({
    db,
    refreshAll: async () => {
      refreshCount++;
    },
    listVideos: async () => videos,
    enqueue: (urls) => enqueued.push({ urls }),
    autoQueueSpec: () => SPEC,
    notify: (n) => notifications.push(n),
    config: () => ({
      intervalMinutes: 0,
      notifyNewVideos: false,
      notifyOutliers: false,
      ...config,
    }),
  });
}
type ChannelSchedulerDepsConfig = () => {
  intervalMinutes: number;
  notifyNewVideos: boolean;
  notifyOutliers: boolean;
};

beforeEach(async () => {
  db = await openTestDatabase();
  runMigrations(db);
  enqueued = [];
  notifications = [];
  refreshCount = 0;
  videos = [video()];
});

describe("tick", () => {
  it("refreshes and queues an upload that matches the rule", async () => {
    channel();
    rule();
    const result = await scheduler().tick();
    expect(refreshCount).toBe(1);
    expect(enqueued).toEqual([{ urls: ["https://y/v1"] }]);
    expect(result.queued.UC1).toEqual(["v1"]);
  });

  it("does nothing for a channel with no enabled rule", async () => {
    channel();
    rule({ enabled: false });
    await scheduler().tick();
    expect(enqueued).toEqual([]);
  });

  it("does not queue what the rule rejects", async () => {
    channel();
    rule({ keywords: ["python"] });
    await scheduler().tick();
    expect(enqueued).toEqual([]);
  });

  it("advances the watermark past rejected uploads, so they are not re-examined", async () => {
    channel();
    rule({ keywords: ["python"] });
    await scheduler().tick();
    expect(getChannelRule(db, "UC1")?.last_queued_id).toBe("v1");
  });

  it("never queues the same upload twice across ticks", async () => {
    channel();
    rule();
    const s = scheduler();
    await s.tick();
    await s.tick();
    expect(enqueued).toHaveLength(1);
  });

  it("queues only what appeared since the last tick", async () => {
    channel();
    rule();
    const s = scheduler();
    await s.tick();

    videos = [
      video({ externalId: "v3", url: "https://y/v3" }),
      video({ externalId: "v2", url: "https://y/v2" }),
      video(),
    ];
    await s.tick();
    expect(enqueued[1]?.urls).toEqual(["https://y/v2", "https://y/v3"]);
    expect(getChannelRule(db, "UC1")?.last_queued_id).toBe("v3");
  });

  it("keeps going when one channel's listing fails", async () => {
    channel();
    channel("UC2");
    rule();
    upsertChannelRule(db, {
      channel_id: "UC2",
      enabled: true,
      min_duration_s: null,
      max_duration_s: null,
      keywords: [],
      min_views: null,
      exclude_shorts: false,
    });
    let calls = 0;
    const s = new ChannelScheduler({
      db,
      refreshAll: async () => {},
      listVideos: async () => {
        calls++;
        if (calls === 1) throw new Error("network");
        return videos;
      },
      enqueue: (urls) => enqueued.push({ urls }),
      autoQueueSpec: () => SPEC,
      notify: (n) => notifications.push(n),
      config: () => ({
        intervalMinutes: 0,
        notifyNewVideos: false,
        notifyOutliers: false,
      }),
    });
    await s.tick();
    expect(calls).toBe(2);
    expect(enqueued).toHaveLength(1);
  });

  it("drops a re-entrant tick rather than double-queueing", async () => {
    channel();
    rule();
    const s = scheduler();
    const [first, second] = await Promise.all([s.tick(), s.tick()]);
    const total =
      Object.keys(first.queued).length + Object.keys(second.queued).length;
    expect(total).toBe(1);
    expect(enqueued).toHaveLength(1);
  });
});

describe("notifications", () => {
  it("reports new uploads and how many were queued", async () => {
    channel();
    rule();
    await scheduler({ notifyNewVideos: true }).tick();
    expect(notifications).toEqual([
      { title: "The Channel", body: "1 new, 1 queued" },
    ]);
  });

  it("says only the count when nothing matched", async () => {
    channel();
    rule({ keywords: ["nope"] });
    await scheduler({ notifyNewVideos: true }).tick();
    expect(notifications[0]?.body).toBe("1 new");
  });

  it("stays silent when notifications are off", async () => {
    channel();
    rule();
    await scheduler().tick();
    expect(notifications).toEqual([]);
  });

  it("flags an upload far above the channel's own median", async () => {
    channel();
    rule();
    videos = [
      video({ externalId: "hit", url: "https://y/hit", viewCount: 900_000 }),
      video({ externalId: "a", viewCount: 10_000 }),
      video({ externalId: "b", viewCount: 12_000 }),
      video({ externalId: "c", viewCount: 9_000 }),
    ];
    await scheduler({ notifyOutliers: true }).tick();
    expect(notifications.some((n) => n.title.startsWith("Outlier on"))).toBe(
      true,
    );
  });

  it("does not flag an ordinary upload", async () => {
    channel();
    rule();
    videos = [
      video({ externalId: "a", viewCount: 10_000 }),
      video({ externalId: "b", viewCount: 11_000 }),
    ];
    await scheduler({ notifyOutliers: true }).tick();
    expect(notifications).toEqual([]);
  });
});

describe("reschedule", () => {
  it("arms nothing at interval zero and stops cleanly", () => {
    const s = scheduler();
    s.reschedule();
    s.stop();
    expect(refreshCount).toBe(0);
  });
});
