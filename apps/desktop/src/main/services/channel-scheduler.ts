import {
  evaluateRule,
  medianViews,
  outlierScore,
  OUTLIER_THRESHOLD,
  type ChannelRule,
  type RuleCandidate,
} from "@sift/core";
import type { QueueSpec } from "@sift/ipc-contract";
import {
  getChannelByChannelId,
  listEnabledChannelRules,
  setChannelRuleWatermark,
  type SiftDatabase,
} from "@sift/db";

// No `electron` import — notifications are injected, so the whole loop is unit-testable.

export interface SchedulerNotification {
  title: string;
  body: string;
}

/** One video as a refresh reports it, plus the URL needed to queue it. */
export interface SchedulerVideo extends RuleCandidate {
  externalId: string;
  url: string;
}

export interface ChannelSchedulerDeps {
  db: SiftDatabase;
  /** Refreshes every channel. Returns nothing — the row state is read back from the db. */
  refreshAll: () => Promise<void>;
  /** The newest uploads for a channel, newest first. */
  listVideos: (channelDbId: number) => Promise<SchedulerVideo[]>;
  /** Adds urls to the download queue. */
  enqueue: (urls: string[], spec: QueueSpec) => void;
  /** The queue spec auto-queued videos are added with. */
  autoQueueSpec: () => QueueSpec;
  notify: (n: SchedulerNotification) => void;
  /** Config, read per tick so a settings change takes effect without a restart. */
  config: () => {
    intervalMinutes: number;
    notifyNewVideos: boolean;
    notifyOutliers: boolean;
  };
  now?: () => number;
}

export interface TickResult {
  /** Videos auto-queued, by channel id. */
  queued: Record<string, string[]>;
  notifications: SchedulerNotification[];
}

function toRule(row: {
  enabled: boolean;
  min_duration_s: number | null;
  max_duration_s: number | null;
  keywords: string[];
  min_views: number | null;
  exclude_shorts: boolean;
}): ChannelRule {
  return {
    enabled: row.enabled,
    minDurationS: row.min_duration_s,
    maxDurationS: row.max_duration_s,
    keywords: row.keywords,
    minViews: row.min_views,
    excludeShorts: row.exclude_shorts,
  };
}

/**
 * Periodic channel refresh, with desktop notifications and rule-driven auto-queue.
 *
 * One timer for every channel rather than one per channel: refreshes are sequential inside
 * `refreshAll` anyway (each is a yt-dlp process), and N timers on N channels is N ways for the
 * schedule to drift apart.
 */
export class ChannelScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly deps: ChannelSchedulerDeps) {}

  /** (Re)arms the timer from the current config. `intervalMinutes: 0` stops it. */
  reschedule(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const minutes = this.deps.config().intervalMinutes;
    if (minutes <= 0) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, minutes * 60_000);
    // `unref` so a pending timer never holds the app open on quit.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Refreshes every channel, then notifies and auto-queues.
   *
   * Re-entrant calls are dropped rather than queued: a refresh of many channels can outlast
   * the interval, and overlapping runs would spawn two yt-dlp processes per channel and
   * double-queue everything between the two watermark writes.
   */
  async tick(): Promise<TickResult> {
    if (this.running) return { queued: {}, notifications: [] };
    this.running = true;
    const result: TickResult = { queued: {}, notifications: [] };
    try {
      await this.deps.refreshAll();
      const cfg = this.deps.config();

      for (const rule of listEnabledChannelRules(this.deps.db)) {
        const channel = getChannelByChannelId(this.deps.db, rule.channel_id);
        if (!channel) continue;

        let videos: SchedulerVideo[];
        try {
          videos = await this.deps.listVideos(channel.id);
        } catch {
          // One unreachable channel must not stop the others.
          continue;
        }

        // Everything newer than the watermark, oldest first so the watermark advances
        // monotonically even if only some of the batch matches the rule.
        const cutoff = rule.last_queued_id
          ? videos.findIndex((v) => v.externalId === rule.last_queued_id)
          : -1;
        const fresh = (
          cutoff >= 0 ? videos.slice(0, cutoff) : videos
        ).reverse();
        if (fresh.length === 0) continue;

        const matched = fresh.filter(
          (v) => evaluateRule(toRule(rule), v) === null,
        );
        if (matched.length > 0) {
          this.deps.enqueue(
            matched.map((v) => v.url),
            this.deps.autoQueueSpec(),
          );
          result.queued[rule.channel_id] = matched.map((v) => v.externalId);
        }

        // The watermark advances past everything seen, not just what matched — otherwise a
        // video the rule rejected is re-examined forever.
        const newest = fresh[fresh.length - 1];
        if (newest)
          setChannelRuleWatermark(
            this.deps.db,
            rule.channel_id,
            newest.externalId,
          );

        if (cfg.notifyNewVideos && fresh.length > 0)
          result.notifications.push({
            title: channel.title,
            body:
              matched.length > 0
                ? `${fresh.length} new, ${matched.length} queued`
                : `${fresh.length} new`,
          });

        if (cfg.notifyOutliers) {
          // Outliers are measured against the channel's own median, so a small channel's hit
          // is as notable as a large one's.
          const median = medianViews(videos);
          for (const v of fresh) {
            const score = outlierScore(v.viewCount, median);
            if (score !== null && score >= OUTLIER_THRESHOLD)
              result.notifications.push({
                title: `Outlier on ${channel.title}`,
                body: v.title,
              });
          }
        }
      }

      for (const n of result.notifications) this.deps.notify(n);
      return result;
    } finally {
      this.running = false;
    }
  }
}
