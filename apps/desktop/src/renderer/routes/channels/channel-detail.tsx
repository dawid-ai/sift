import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Download,
  Film,
  ListVideo,
  Plus,
  RefreshCw,
  Users,
  type LucideIcon,
} from "lucide-react";
import type {
  ChannelRecord,
  ChannelVideo,
  ChannelVideoStatus,
  ChannelContentType,
  ChannelOrder,
  DownloadedVideo,
  QueueSpec,
} from "@sift/ipc-contract";
import { outlierScore, OUTLIER_THRESHOLD } from "@sift/core";
import { Button } from "@/components/ui/button";
import { FIELD } from "@/routes/settings/settings-page";
import { thumbUrl, videoThumbUrl } from "@/lib/utils";
import { extractEmails, extractLinks } from "@/lib/extract-links";
import { QueueSpecControls } from "@/components/queue-spec-controls";

const ORDERS: { value: ChannelOrder; label: string }[] = [
  { value: "latest", label: "Latest" },
  { value: "oldest", label: "Oldest" },
  { value: "most_viewed", label: "Most viewed" },
];
// `ALL` is a sentinel count — yt-dlp caps at the channel's real length, so 1:100000 == every video.
const ALL = 100000;
const COUNTS: { value: number; label: string }[] = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 500, label: "500" },
  { value: 1000, label: "1,000" },
  { value: ALL, label: "All videos" },
];
const CONTENT_TYPES: {
  value: ChannelContentType;
  label: string;
  testid: string;
}[] = [
  { value: "videos", label: "Videos", testid: "channel-content-videos" },
  { value: "shorts", label: "Shorts", testid: "channel-content-shorts" },
  { value: "live", label: "Live", testid: "channel-content-live" },
];
// Same 40px control shell as the queue spec controls — one height, one radius, one hairline —
// and now literally the same skin, taken from the shared `FIELD` instead of a third copy of it
// spelled out by hand. This toolbar sits 40px above a QueueSpecControls row that renders the
// identical selects; the two had drifted into two fills on one screen.
const SELECT_CLASS = `h-10 w-full appearance-none rounded-xl border ${FIELD} pl-3 pr-9 text-sm text-foreground transition-colors focus:outline-none`;
const PILL =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5";
const NEUTRAL_PILL = `${PILL} border-foreground/[0.12] bg-foreground/[0.06] text-muted-foreground`;

/** mm:ss for a video duration, or null. */
function fmtDuration(sec: number | null): string | null {
  if (sec == null) return null;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** First letter of a channel name, for the avatar fallback. */
function initial(title: string | null | undefined): string {
  const m = (title ?? "").trim().match(/[\p{L}\p{N}]/u);
  return m?.[0]?.toUpperCase() ?? "?";
}

/** Label above a control — `.field-label`, the rung globals.css documents for exactly this,
 * and the same class the queue spec controls use, so a field label is one object wherever it
 * appears instead of two copies of one declaration that drift apart. White-neutral, not
 * amber: the eyebrow stays reserved for section headings. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="field-label mb-2">{label}</span>
      {children}
    </div>
  );
}

/** Native <select> plus an inert chevron — `appearance-none` removes Chromium's grey wedge,
 * which is the single biggest "unstyled form" tell on a dark surface. */
function SelectShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      {children}
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40"
      />
    </div>
  );
}

/** A hero stat. Same elevated shell as the Queue counters — a top-lit white-alpha fill, an
 * inset highlight and a deep drop, so it sits *above* the panel it's in rather than being a
 * hairline rectangle cut out of it. Label and icon share one baseline row; the figure is the
 * loudest thing on the tile. A missing value renders as an em dash at muted weight. */
function HeroStat({
  label,
  value,
  icon: Icon,
  testId,
}: {
  label: string;
  value: number | null;
  icon: LucideIcon;
  testId?: string;
}) {
  const empty = value == null;
  return (
    <div
      data-testid={testId}
      className="relative min-w-[148px] flex-1 overflow-hidden rounded-xl border border-foreground/[0.12] bg-gradient-to-b from-foreground/[0.055] to-foreground/[0.015] px-4 py-3.5 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.07),0_10px_28px_-16px_hsl(0_0%_0%/0.85)]"
    >
      <div className="relative flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase leading-none tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        <span
          aria-hidden
          className="grid h-5 w-5 flex-none place-items-center rounded-md bg-foreground/[0.08] text-muted-foreground"
        >
          <Icon strokeWidth={1.5} className="h-3.5 w-3.5" />
        </span>
      </div>
      <p
        className={`relative mt-3 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${
          empty ? "text-foreground/70" : "text-foreground"
        }`}
      >
        {value == null ? "—" : value.toLocaleString()}
      </p>
    </div>
  );
}

export function ChannelDetail({
  channel,
  onBack,
  onOpenMedia,
}: {
  channel: ChannelRecord;
  onBack: () => void;
  onOpenMedia?: (mediaId: number) => void;
}) {
  const [downloaded, setDownloaded] = useState<DownloadedVideo[]>([]);
  const [showFullDesc, setShowFullDesc] = useState(false);
  // A stats sync returns a fresh record (subscribers, video total). The prop is owned by the
  // list route, so the newer copy is held here and everything below reads `ch`.
  const [synced, setSynced] = useState<ChannelRecord | null>(null);
  const ch = synced ?? channel;
  const links = extractLinks(ch.description);
  const emails = extractEmails(ch.description);
  useEffect(() => {
    let live = true;
    void window.sift.channels.downloadedMedia(channel.channelId).then((d) => {
      if (live) setDownloaded(d);
    });
    return () => {
      live = false;
    };
  }, [channel.channelId]);

  const [contentType, setContentType] = useState<ChannelContentType>("videos");
  const [order, setOrder] = useState<ChannelOrder>("latest");
  const [count, setCount] = useState(25);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ChannelVideoStatus>>(
    {},
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<QueueSpec | null>(null);
  const onSpec = useCallback((s: QueueSpec) => setSpec(s), []);
  // Outlier baseline, straight from main: the synced catalogue's median when there is one,
  // otherwise the median of the page just fetched.
  const [median, setMedian] = useState<number | null>(null);
  const [fromCatalog, setFromCatalog] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const getVideos = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    setSelected(new Set());
    setStatuses({});
    try {
      const res = await window.sift.channels.listVideos(channel.id, {
        contentType,
        order,
        count,
      });
      setVideos(res.videos);
      setMedian(res.median);
      setFromCatalog(res.source === "catalog");
      if (!res.viewCountsAvailable && order === "most_viewed")
        setNote(
          "View counts unavailable for this channel — showing latest instead.",
        );
      // Flag videos already queued / downloaded so we don't re-pull them.
      setStatuses(
        await window.sift.channels.videoStatuses(res.videos.map((v) => v.url)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // Select/unselect only videos that aren't already queued or downloaded.
  const selectable = (v: ChannelVideo) => !statuses[v.url];
  const selectAll = () =>
    setSelected(new Set(videos.filter(selectable).map((v) => v.url)));
  const unselectAll = () => setSelected(new Set());
  const syncStats = async () => {
    setSyncing(true);
    setError(null);
    setNote(null);
    try {
      const res = await window.sift.channels.syncStats(channel.id);
      setSynced(res.channel);
      const total = res.counts.videos + res.counts.shorts + res.counts.live;
      setNote(
        `Stats synced for ${total.toLocaleString()} videos.` +
          (res.failures.length > 0
            ? ` ${res.failures.map((f) => f.contentType).join(", ")} unavailable.`
            : ""),
      );
      await getVideos();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  const addToQueue = async () => {
    if (!spec || selected.size === 0) return;
    setError(null);
    const added = [...selected];
    try {
      await window.sift.queue.add(added, spec);
      // Reflect immediately: mark the just-added videos Queued and drop them from the selection
      // so their checkboxes lock and they can't be added twice.
      setStatuses((m) => {
        const n = { ...m };
        for (const u of added) n[u] = "queued";
        return n;
      });
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    // Identical shell to Queue and Channels — same scroll box, same reserved scrollbar gutter,
    // same centred 1120px column — so opening a channel doesn't shift the page sideways.
    <main
      data-testid="channel-detail"
      className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
    >
      <div
        className={`mx-auto flex min-h-full w-full max-w-[1120px] flex-col gap-8 px-10 pt-7 ${
          videos.length > 0 ? "pb-0" : "pb-10"
        }`}
      >
        {/* Same top rail as the media detail view: back on the left, source actions on the right. */}
        <div className="flex items-center gap-2">
          <Button
            data-testid="channel-detail-back"
            size="sm"
            variant="outline"
            onClick={onBack}
          >
            {"← Channels"}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {ch.statsSyncedAt && (
              <span className="text-xs text-muted-foreground">
                Stats synced {new Date(ch.statsSyncedAt).toLocaleString()}
              </span>
            )}
            <Button
              data-testid="channel-sync-stats"
              size="sm"
              variant="outline"
              disabled={syncing}
              onClick={syncStats}
              title="Pull view counts for every video on this channel, so outliers are measured against the whole catalogue"
            >
              <RefreshCw aria-hidden className="h-4 w-4" />
              {syncing ? "Syncing…" : "Sync stats"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.sift.library.openExternal(ch.url)}
            >
              {"Open channel ↗"}
            </Button>
          </div>
        </div>

        {/* Hero: banner, identity, stat strip, and an About block (description + extracted links). */}
        <section className="panel-lit">
          {channel.bannerUrl && (
            <div className="relative h-36 overflow-hidden rounded-t-[15px]">
              <img
                src={thumbUrl(channel.bannerUrl)}
                alt=""
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
                className="h-full w-full object-cover"
              />
              {/* Scrim so the banner dissolves into the panel instead of ending on a hard edge. */}
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent"
              />
            </div>
          )}

          <div className="flex items-start gap-4 px-6 pb-5 pt-5">
            {/* Same monogram treatment as the Channels rows: the letter is the fallback
                identity, so it reads at `foreground/80` rather than the /40 that measured
                3.38:1 in the list. No deterministic tint here — a hero has no siblings to be
                told apart from. */}
            <span className="relative grid h-16 w-16 flex-none place-items-center overflow-hidden rounded-full border border-border-strong bg-surface-2 text-xl font-bold uppercase text-foreground/80">
              <span aria-hidden>{initial(channel.title)}</span>
              {channel.avatarUrl && (
                <img
                  src={thumbUrl(channel.avatarUrl)}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="eyebrow">CHANNEL</p>
              <h1 className="mt-1.5 truncate text-[26px] font-bold leading-tight tracking-tight text-foreground">
                {channel.title}
              </h1>
              {channel.handle && (
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {channel.handle}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5 px-6 pb-6">
            <HeroStat
              label="Subscribers"
              value={ch.followerCount}
              icon={Users}
            />
            <HeroStat label="Videos" value={ch.videoCount} icon={Film} />
            <HeroStat
              label="Downloaded"
              value={downloaded.length}
              icon={Download}
              testId="channel-downloaded-count"
            />
          </div>

          {(ch.description || links.length > 0 || emails.length > 0) && (
            <div className="border-t border-border px-6 py-5">
              <p className="eyebrow">About</p>
              {ch.description && (
                <>
                  <p
                    className={`mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground ${showFullDesc ? "" : "line-clamp-3"}`}
                  >
                    {ch.description}
                  </p>
                  {ch.description.length > 180 && (
                    <button
                      type="button"
                      onClick={() => setShowFullDesc((v) => !v)}
                      className="mt-1.5 rounded-sm text-xs font-medium text-primary underline decoration-primary/40 underline-offset-[3px] transition-colors hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {showFullDesc ? "Show less" : "Show more"}
                    </button>
                  )}
                </>
              )}
              {links.length > 0 && (
                <div className="mt-3.5 flex flex-wrap gap-2">
                  {links.map((l) => (
                    <button
                      key={l}
                      type="button"
                      data-testid="channel-link"
                      onClick={() => window.sift.library.openExternal(l)}
                      className="max-w-full truncate rounded-full border border-primary/25 bg-primary/[0.08] px-3 py-1 text-xs font-medium text-primary transition-colors hover:border-primary/45 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      title={l}
                    >
                      {l.replace(/^https?:\/\/(www\.)?/, "")} ↗
                    </button>
                  ))}
                </div>
              )}
              {emails.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {emails.map((e) => (
                    <span
                      key={e}
                      data-testid="channel-email"
                      className={NEUTRAL_PILL}
                      title="Read out of the channel description — YouTube's About-tab email is captcha-gated and can't be fetched"
                    >
                      {e}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Videos already downloaded from this channel → open their in-app detail. */}
        {downloaded.length > 0 && (
          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2/40 px-5 py-3">
              <h3 className="eyebrow">Downloaded from this channel</h3>
              <span className={NEUTRAL_PILL}>
                <span className="tabular-nums">{downloaded.length}</span>
                {downloaded.length === 1 ? "video" : "videos"}
              </span>
            </div>
            {downloaded.map((d) => (
              <button
                key={d.id}
                type="button"
                data-testid="channel-downloaded-item"
                onClick={() => onOpenMedia?.(d.id)}
                className="group flex w-full items-center gap-3.5 border-b border-border px-5 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-foreground/[0.03]"
              >
                <span className="relative h-9 w-16 flex-none overflow-hidden rounded-md border border-border bg-surface-2">
                  {d.thumbnailUrl && (
                    <img
                      src={videoThumbUrl(d.thumbnailUrl)}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.visibility = "hidden";
                      }}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground/90 transition-colors group-hover:text-foreground">
                  {d.title}
                </span>
                <span className="flex-none text-xs tabular-nums text-muted-foreground">
                  {new Date(d.createdAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </section>
        )}

        {/* Controls toolbar */}
        <section className="panel px-5 py-4">
          <p className="eyebrow">List videos</p>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <Field label="Content">
              <div className="inline-flex h-10 items-center rounded-xl border border-border bg-surface-2/60 p-1">
                {CONTENT_TYPES.map((ct) => (
                  <button
                    key={ct.value}
                    data-testid={ct.testid}
                    type="button"
                    onClick={() => setContentType(ct.value)}
                    className={`h-8 rounded-lg px-3.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                      contentType === ct.value
                        ? "bg-gradient-to-br from-primary to-primary-lit font-semibold text-primary-foreground shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.22)]"
                        : "font-medium text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Order">
              <SelectShell className="w-[150px]">
                <select
                  data-testid="channel-order"
                  className={SELECT_CLASS}
                  value={order}
                  onChange={(e) => setOrder(e.target.value as ChannelOrder)}
                >
                  {ORDERS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </SelectShell>
            </Field>
            <Field label="How many">
              <SelectShell className="w-[130px]">
                <select
                  data-testid="channel-count"
                  className={SELECT_CLASS}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                >
                  {COUNTS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </SelectShell>
            </Field>
            <Button
              data-testid="channel-get-videos"
              onClick={getVideos}
              disabled={busy}
            >
              <ListVideo aria-hidden className="h-4 w-4" />
              {busy ? "Loading…" : "Get videos"}
            </Button>
          </div>
        </section>

        {note && (
          <p
            data-testid="channel-mostviewed-note"
            className="rounded-xl border border-warning/25 bg-warning/12 px-4 py-2.5 text-xs text-warning"
          >
            {note}
          </p>
        )}
        {error && (
          <p className="rounded-xl border border-danger/25 bg-danger/12 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        {videos.length > 0 && (
          <>
            {/* The column's own 32px step is what separates the list from the sticky action
                bar below — no extra local margin, same value as every other gap on the page. */}
            <section className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2/40 px-5 py-3">
                <div className="flex items-center gap-3">
                  <p className="eyebrow">Videos</p>
                  <span className="text-xs text-muted-foreground">
                    <b className="font-semibold tabular-nums text-foreground/80">
                      {selected.size}
                    </b>{" "}
                    selected ·{" "}
                    <b className="font-semibold tabular-nums text-foreground/80">
                      {videos.length}
                    </b>{" "}
                    shown
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    data-testid="channel-select-all"
                    size="sm"
                    variant="outline"
                    onClick={selectAll}
                  >
                    Select all
                  </Button>
                  <Button
                    data-testid="channel-unselect-all"
                    size="sm"
                    variant="outline"
                    onClick={unselectAll}
                    disabled={selected.size === 0}
                  >
                    Unselect all
                  </Button>
                </div>
              </div>

              {videos.map((v) => {
                const status = statuses[v.url];
                const locked = status === "queued" || status === "downloaded";
                const isSelected = selected.has(v.url);
                const meta = [
                  fmtDuration(v.durationSec),
                  v.viewCount != null
                    ? `${v.viewCount.toLocaleString()} views`
                    : null,
                  v.isShort ? "Short" : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                const score = outlierScore(v.viewCount, median);
                return (
                  <label
                    data-testid="channel-video"
                    key={v.externalId}
                    className={`relative flex cursor-pointer items-center gap-3.5 border-b border-border px-5 py-3 text-sm transition-colors last:border-b-0 ${
                      locked
                        ? "cursor-not-allowed opacity-50"
                        : isSelected
                          ? "bg-primary/[0.07]"
                          : "hover:bg-foreground/[0.03]"
                    }`}
                  >
                    {isSelected && !locked && (
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-[2px] bg-primary"
                      />
                    )}
                    {/* The real input stays visible and hit-testable; `appearance-none` just
                        swaps Chromium's grey system box for the app's own square. */}
                    <span className="relative grid h-4 w-4 flex-none place-items-center">
                      <input
                        data-testid="channel-video-checkbox"
                        type="checkbox"
                        className="peer h-4 w-4 cursor-pointer appearance-none rounded-[5px] border border-foreground/20 bg-foreground/[0.05] transition-colors checked:border-primary checked:bg-primary hover:border-foreground/35 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        checked={isSelected}
                        disabled={locked}
                        onChange={() => toggle(v.url)}
                      />
                      <Check
                        aria-hidden
                        strokeWidth={3.5}
                        className="pointer-events-none absolute h-2.5 w-2.5 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground/90">
                          {v.title}
                        </span>
                        {score != null && score >= OUTLIER_THRESHOLD && (
                          <span
                            data-testid={`channel-video-outlier-${v.externalId}`}
                            title={
                              fromCatalog
                                ? "Views versus the median of every video on this channel — not adjusted for video age"
                                : "Views versus the median of the videos currently listed. Sync stats to score against the whole channel."
                            }
                            className={`${PILL} flex-none border-primary/25 bg-primary/12 font-semibold text-primary`}
                          >
                            {`${score.toFixed(1)}×`}
                          </span>
                        )}
                      </p>
                      {meta && (
                        <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
                          {meta}
                        </p>
                      )}
                    </div>
                    {status === "queued" && (
                      <span
                        data-testid="channel-video-queued"
                        className={`${PILL} flex-none border-warning/25 bg-warning/12 text-warning`}
                      >
                        Queued
                      </span>
                    )}
                    {status === "downloaded" && (
                      <span
                        data-testid="channel-video-downloaded"
                        className={`${PILL} flex-none border-success/25 bg-success/12 text-success`}
                      >
                        Downloaded
                      </span>
                    )}
                  </label>
                );
              })}
            </section>

            {/* Floating action bar: pinned to the viewport bottom so it stays reachable with
                hundreds of videos listed. Opaque bg + top border keep the list from bleeding through. */}
            <div className="sticky bottom-0 -mx-10 flex flex-col gap-3.5 border-t border-border-strong bg-background px-10 py-4 shadow-[0_-20px_44px_-20px_hsl(0_0%_0%/0.9)]">
              <QueueSpecControls onChange={onSpec} />
              <Button
                data-testid="channel-add-to-queue"
                className="h-11"
                onClick={addToQueue}
                disabled={selected.size === 0}
              >
                <Plus aria-hidden className="h-4 w-4" />
                {`Add ${selected.size} selected to queue`}
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
