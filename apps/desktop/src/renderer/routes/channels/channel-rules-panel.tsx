import { useEffect, useState } from "react";
import { Bell, Clock, Wand2 } from "lucide-react";
import { describeRule, parseKeywords } from "@sift/core";
import type {
  ChannelRefreshConfig,
  ChannelRuleInfo,
  ChannelRecord,
} from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FilterSelect } from "@/components/ui/filter-select";
import { cn } from "@/lib/utils";

/** Offered intervals. Below 15 minutes is refused by the store — uploads are not that frequent. */
const INTERVALS = [
  { value: "0", label: "Off" },
  { value: "15", label: "Every 15 minutes" },
  { value: "60", label: "Hourly" },
  { value: "360", label: "Every 6 hours" },
  { value: "720", label: "Every 12 hours" },
  { value: "1440", label: "Daily" },
];

interface Draft {
  enabled: boolean;
  minMinutes: string;
  maxMinutes: string;
  keywords: string;
  minViews: string;
  excludeShorts: boolean;
}

function toDraft(rule: ChannelRuleInfo | undefined): Draft {
  return {
    enabled: rule?.enabled ?? false,
    minMinutes:
      rule?.min_duration_s != null
        ? String(Math.round(rule.min_duration_s / 60))
        : "",
    maxMinutes:
      rule?.max_duration_s != null
        ? String(Math.round(rule.max_duration_s / 60))
        : "",
    keywords: rule?.keywords.join(", ") ?? "",
    minViews: rule?.min_views != null ? String(rule.min_views) : "",
    excludeShorts: rule?.exclude_shorts ?? true,
  };
}

const minutesToSeconds = (raw: string): number | null => {
  const n = Number(raw.trim());
  return raw.trim() === "" || !Number.isFinite(n) || n < 0
    ? null
    : Math.round(n * 60);
};

const toCount = (raw: string): number | null => {
  const n = Number(raw.trim());
  return raw.trim() === "" || !Number.isFinite(n) || n < 0
    ? null
    : Math.round(n);
};

/**
 * The refresh schedule, notification toggles, and one auto-queue rule per tracked channel.
 *
 * Auto-queue downloads only — transcripts and summaries stay manual, because those spend API
 * credits and a rule that silently does so is a bill the user did not agree to.
 */
export function ChannelRulesPanel({ channels }: { channels: ChannelRecord[] }) {
  const [config, setConfig] = useState<ChannelRefreshConfig | null>(null);
  const [rules, setRules] = useState<ChannelRuleInfo[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft(undefined));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    void Promise.all([
      window.sift.channelRules.getConfig(),
      window.sift.channelRules.list(),
    ])
      .then(([c, r]) => {
        setConfig(c);
        setRules(r);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(load, []);

  async function saveConfig(next: ChannelRefreshConfig) {
    setError(null);
    try {
      setConfig(await window.sift.channelRules.setConfig(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function openEditor(channelId: string) {
    setOpenId(channelId);
    setDraft(toDraft(rules.find((r) => r.channel_id === channelId)));
    setError(null);
  }

  async function saveRule(channelId: string) {
    setBusy(true);
    setError(null);
    try {
      await window.sift.channelRules.set({
        channelId,
        enabled: draft.enabled,
        minDurationS: minutesToSeconds(draft.minMinutes),
        maxDurationS: minutesToSeconds(draft.maxMinutes),
        keywords: parseKeywords(draft.keywords),
        minViews: toCount(draft.minViews),
        excludeShorts: draft.excludeShorts,
      });
      setOpenId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function refreshNow() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const tick = await window.sift.channelRules.refreshNow();
      const queued = Object.values(tick.queued).flat().length;
      setStatus(
        queued > 0
          ? `Queued ${queued} new ${queued === 1 ? "upload" : "uploads"}.`
          : "Nothing new matched a rule.",
      );
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!config) return null;

  return (
    <section className="flex flex-col gap-3" data-testid="channel-rules-panel">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-black/25 p-3">
        <Clock aria-hidden className="h-4 w-4 text-foreground/50" />
        <span className="text-[13px] text-foreground">
          Check for new uploads
        </span>
        <FilterSelect
          value={String(config.intervalMinutes)}
          onChange={(v) =>
            void saveConfig({ ...config, intervalMinutes: Number(v ?? 0) })
          }
          options={INTERVALS}
          allLabel="Off"
          testId="refresh-interval"
        />

        <span className="mx-1 h-5 w-px bg-white/10" aria-hidden />
        <Bell aria-hidden className="h-4 w-4 text-foreground/50" />
        <label className="flex items-center gap-2 text-[12px] text-foreground/75">
          <Switch
            data-testid="notify-new"
            aria-label="Notify about new uploads"
            checked={config.notifyNewVideos}
            onChange={(next) =>
              void saveConfig({ ...config, notifyNewVideos: next })
            }
          />
          New uploads
        </label>
        <label className="flex items-center gap-2 text-[12px] text-foreground/75">
          <Switch
            data-testid="notify-outliers"
            aria-label="Notify about outlier uploads"
            checked={config.notifyOutliers}
            onChange={(next) =>
              void saveConfig({ ...config, notifyOutliers: next })
            }
          />
          Outliers
        </label>

        <Button
          variant="ghost"
          className="ml-auto h-9 px-2.5 text-[12px]"
          data-testid="refresh-now"
          disabled={busy}
          onClick={() => void refreshNow()}
        >
          {busy ? "Checking…" : "Check now"}
        </Button>
      </div>

      {status && (
        <p
          className="text-[12px] text-foreground/70"
          data-testid="rules-status"
        >
          {status}
        </p>
      )}
      {error && (
        <p className="text-[12px] text-danger" data-testid="rules-error">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {channels.map((channel) => {
          const rule = rules.find((r) => r.channel_id === channel.channelId);
          const open = openId === channel.channelId;
          return (
            <li
              key={channel.channelId}
              data-testid="channel-rule-row"
              className="rounded-xl border border-white/[0.06] bg-black/20 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Wand2 aria-hidden className="h-3.5 w-3.5 text-foreground/45" />
                <span className="text-[13px] text-foreground">
                  {channel.title}
                </span>
                <span
                  data-testid="channel-rule-summary"
                  className={cn(
                    "text-[12px]",
                    rule?.enabled ? "text-primary" : "text-foreground/45",
                  )}
                >
                  {rule
                    ? describeRule({
                        enabled: rule.enabled,
                        minDurationS: rule.min_duration_s,
                        maxDurationS: rule.max_duration_s,
                        keywords: rule.keywords,
                        minViews: rule.min_views,
                        excludeShorts: rule.exclude_shorts,
                      })
                    : "No rule"}
                </span>
                <Button
                  variant="ghost"
                  className="ml-auto h-8 px-2.5 text-[12px]"
                  data-testid={`channel-rule-edit-${channel.channelId}`}
                  onClick={() =>
                    open ? setOpenId(null) : openEditor(channel.channelId)
                  }
                >
                  {open ? "Close" : rule ? "Edit rule" : "Add rule"}
                </Button>
              </div>

              {open && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-white/[0.05] pt-3">
                  <label className="flex items-center gap-2 text-[12px] text-foreground/75">
                    <Switch
                      data-testid="rule-enabled"
                      aria-label="Auto-queue new uploads"
                      checked={draft.enabled}
                      onChange={(next) => setDraft({ ...draft, enabled: next })}
                    />
                    Auto-queue
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-foreground/55">
                    Shortest (min)
                    <Input
                      type="number"
                      min="0"
                      data-testid="rule-min-minutes"
                      aria-label="Shortest length in minutes"
                      className="h-9 w-[7rem] text-[12px]"
                      value={draft.minMinutes}
                      onChange={(e) =>
                        setDraft({ ...draft, minMinutes: e.target.value })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-foreground/55">
                    Longest (min)
                    <Input
                      type="number"
                      min="0"
                      data-testid="rule-max-minutes"
                      aria-label="Longest length in minutes"
                      className="h-9 w-[7rem] text-[12px]"
                      value={draft.maxMinutes}
                      onChange={(e) =>
                        setDraft({ ...draft, maxMinutes: e.target.value })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-foreground/55">
                    Minimum views
                    <Input
                      type="number"
                      min="0"
                      data-testid="rule-min-views"
                      aria-label="Minimum view count"
                      className="h-9 w-[8rem] text-[12px]"
                      value={draft.minViews}
                      onChange={(e) =>
                        setDraft({ ...draft, minViews: e.target.value })
                      }
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1 text-[11px] text-foreground/55">
                    Title keywords (comma separated, any match)
                    <Input
                      data-testid="rule-keywords"
                      aria-label="Title keywords"
                      className="h-9 min-w-[12rem] text-[12px]"
                      placeholder="rust, database"
                      value={draft.keywords}
                      onChange={(e) =>
                        setDraft({ ...draft, keywords: e.target.value })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[12px] text-foreground/75">
                    <Switch
                      data-testid="rule-exclude-shorts"
                      aria-label="Skip Shorts"
                      checked={draft.excludeShorts}
                      onChange={(next) =>
                        setDraft({ ...draft, excludeShorts: next })
                      }
                    />
                    Skip Shorts
                  </label>
                  <Button
                    className="h-9 px-3 text-[12px]"
                    data-testid="rule-save"
                    disabled={busy}
                    onClick={() => void saveRule(channel.channelId)}
                  >
                    Save rule
                  </Button>
                  <p className="w-full text-[11px] leading-relaxed text-foreground/45">
                    Matching uploads are queued for download only. Transcribing
                    and summarizing stay manual, so a rule can never spend API
                    credits on its own.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
