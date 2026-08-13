import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChannelRecord, ChannelVideo, ChannelVideoStatus, ChannelContentType, ChannelOrder, DownloadedVideo, QueueSpec } from "@sift/ipc-contract";
import { medianViews, outlierScore, OUTLIER_THRESHOLD } from "@sift/core";
import { Button } from "@/components/ui/button";
import { thumbUrl, videoThumbUrl } from "@/lib/utils";
import { extractLinks } from "@/lib/extract-links";
import { QueueSpecControls } from "@/components/queue-spec-controls";

const ORDERS: { value: ChannelOrder; label: string }[] = [
  { value: "latest", label: "Latest" }, { value: "oldest", label: "Oldest" }, { value: "most_viewed", label: "Most viewed" },
];
// `ALL` is a sentinel count — yt-dlp caps at the channel's real length, so 1:100000 == every video.
const ALL = 100000;
const COUNTS: { value: number; label: string }[] = [
  { value: 10, label: "10" }, { value: 25, label: "25" }, { value: 50, label: "50" },
  { value: 100, label: "100" }, { value: 500, label: "500" }, { value: 1000, label: "1,000" },
  { value: ALL, label: "All videos" },
];
const CONTENT_TYPES: { value: ChannelContentType; label: string; testid: string }[] = [
  { value: "videos", label: "Videos", testid: "channel-content-videos" },
  { value: "shorts", label: "Shorts", testid: "channel-content-shorts" },
  { value: "live", label: "Live", testid: "channel-content-live" },
];
const SELECT_CLASS = "h-9 rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** mm:ss for a video duration, or null. */
function fmtDuration(sec: number | null): string | null {
  if (sec == null) return null;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function ChannelDetail({ channel, onBack, onOpenMedia }: { channel: ChannelRecord; onBack: () => void; onOpenMedia?: (mediaId: number) => void }) {
  const [downloaded, setDownloaded] = useState<DownloadedVideo[]>([]);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const links = extractLinks(channel.description);
  useEffect(() => {
    let live = true;
    void window.sift.channels.downloadedMedia(channel.channelId).then((d) => { if (live) setDownloaded(d); });
    return () => { live = false; };
  }, [channel.channelId]);

  const [contentType, setContentType] = useState<ChannelContentType>("videos");
  const [order, setOrder] = useState<ChannelOrder>("latest");
  const [count, setCount] = useState(25);
  const [videos, setVideos] = useState<ChannelVideo[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ChannelVideoStatus>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<QueueSpec | null>(null);
  const onSpec = useCallback((s: QueueSpec) => setSpec(s), []);
  const median = useMemo(() => medianViews(videos), [videos]);

  const getVideos = async () => {
    setBusy(true); setError(null); setNote(null); setSelected(new Set()); setStatuses({});
    try {
      const res = await window.sift.channels.listVideos(channel.id, { contentType, order, count });
      setVideos(res.videos);
      if (!res.viewCountsAvailable && order === "most_viewed") setNote("View counts unavailable for this channel — showing latest instead.");
      // Flag videos already queued / downloaded so we don't re-pull them.
      setStatuses(await window.sift.channels.videoStatuses(res.videos.map((v) => v.url)));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  // Select/unselect only videos that aren't already queued or downloaded.
  const selectable = (v: ChannelVideo) => !statuses[v.url];
  const selectAll = () => setSelected(new Set(videos.filter(selectable).map((v) => v.url)));
  const unselectAll = () => setSelected(new Set());
  const addToQueue = async () => {
    if (!spec || selected.size === 0) return;
    setError(null);
    const added = [...selected];
    try {
      await window.sift.queue.add(added, spec);
      // Reflect immediately: mark the just-added videos Queued and drop them from the selection
      // so their checkboxes lock and they can't be added twice.
      setStatuses((m) => { const n = { ...m }; for (const u of added) n[u] = "queued"; return n; });
      setSelected(new Set());
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div data-testid="channel-detail" className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-8 pb-0">
      <Button data-testid="channel-detail-back" size="sm" variant="outline" className="self-start" onClick={onBack}>{"← Channels"}</Button>

      {/* Hero: banner, identity, stats, and an About block (description + extracted links). */}
      <div className="overflow-hidden rounded-xl border border-border">
        {channel.bannerUrl && (
          <img src={thumbUrl(channel.bannerUrl)} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-40 w-full object-cover" />
        )}
        <div className="flex items-start gap-4 p-4">
          {channel.avatarUrl && <img src={thumbUrl(channel.avatarUrl)} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="h-16 w-16 flex-none rounded-full border-2 border-background object-cover" />}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold">{channel.title}</h2>
            {channel.handle && <p className="truncate text-sm text-foreground/55">{channel.handle}</p>}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/60">
              {channel.followerCount != null && <span><b className="font-semibold text-foreground/80">{channel.followerCount.toLocaleString()}</b> subs</span>}
              {channel.videoCount != null && <span><b className="font-semibold text-foreground/80">{channel.videoCount.toLocaleString()}</b> videos</span>}
              <span data-testid="channel-downloaded-count"><b className="font-semibold text-foreground/80">{downloaded.length}</b> downloaded</span>
            </div>
          </div>
          <Button size="sm" variant="outline" className="flex-none" onClick={() => window.sift.library.openExternal(channel.url)}>{"Open channel ↗"}</Button>
        </div>

        {(channel.description || links.length > 0) && (
          <div className="border-t border-border p-4">
            {channel.description && (
              <>
                <p className={`whitespace-pre-wrap text-sm text-foreground/70 ${showFullDesc ? "" : "line-clamp-3"}`}>{channel.description}</p>
                {channel.description.length > 180 && (
                  <button type="button" onClick={() => setShowFullDesc((v) => !v)} className="mt-1 text-xs text-primary hover:underline">
                    {showFullDesc ? "Show less" : "Show more"}
                  </button>
                )}
              </>
            )}
            {links.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {links.map((l) => (
                  <button key={l} type="button" data-testid="channel-link" onClick={() => window.sift.library.openExternal(l)} className="max-w-full truncate rounded-full border border-border px-2.5 py-1 text-xs text-primary hover:bg-primary/10" title={l}>
                    {l.replace(/^https?:\/\/(www\.)?/, "")} ↗
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Videos already downloaded from this channel → open their in-app detail. */}
      {downloaded.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">Downloaded from this channel <span className="text-foreground/45">{downloaded.length}</span></h3>
          <div className="flex flex-col gap-1">
            {downloaded.map((d) => (
              <button key={d.id} type="button" data-testid="channel-downloaded-item" onClick={() => onOpenMedia?.(d.id)} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:border-foreground/20">
                {d.thumbnailUrl && <img src={videoThumbUrl(d.thumbnailUrl)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="h-9 w-16 flex-none rounded object-cover" />}
                <span className="min-w-0 flex-1 truncate">{d.title}</span>
                <span className="flex-none text-xs text-foreground/45">{new Date(d.createdAt).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Controls toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {CONTENT_TYPES.map((ct) => (
            <button
              key={ct.value}
              data-testid={ct.testid}
              type="button"
              onClick={() => setContentType(ct.value)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                contentType === ct.value ? "bg-primary text-primary-foreground" : "text-foreground/60 hover:text-foreground"
              }`}
            >
              {ct.label}
            </button>
          ))}
        </div>
        <select data-testid="channel-order" className={SELECT_CLASS} value={order} onChange={(e) => setOrder(e.target.value as ChannelOrder)}>
          {ORDERS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
        <select data-testid="channel-count" className={SELECT_CLASS} value={count} onChange={(e) => setCount(Number(e.target.value))}>
          {COUNTS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
        </select>
        <Button data-testid="channel-get-videos" onClick={getVideos} disabled={busy}>{busy ? "Loading…" : "Get videos"}</Button>
      </div>
      {note && <p data-testid="channel-mostviewed-note" className="text-xs text-amber-600">{note}</p>}
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-500">{error}</p>}

      {videos.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <Button data-testid="channel-select-all" size="sm" variant="outline" onClick={selectAll}>Select all</Button>
            <Button data-testid="channel-unselect-all" size="sm" variant="outline" onClick={unselectAll} disabled={selected.size === 0}>Unselect all</Button>
            <span className="text-xs text-foreground/50">{selected.size} selected · {videos.length} shown</span>
          </div>
          {/* pb leaves room so the last rows scroll clear of the sticky action bar below */}
          <div className="flex flex-col gap-1.5 pb-4">
            {videos.map((v) => {
              const status = statuses[v.url];
              const locked = status === "queued" || status === "downloaded";
              const isSelected = selected.has(v.url);
              const meta = [fmtDuration(v.durationSec), v.viewCount != null ? `${v.viewCount.toLocaleString()} views` : null, v.isShort ? "Short" : null].filter(Boolean).join(" · ");
              const score = outlierScore(v.viewCount, median);
              return (
                <label
                  data-testid="channel-video"
                  key={v.externalId}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    locked ? "cursor-not-allowed border-border opacity-55" : isSelected ? "border-primary/40 bg-primary/5" : "border-border hover:border-foreground/20"
                  }`}
                >
                  <input data-testid="channel-video-checkbox" type="checkbox" className="h-4 w-4 flex-none accent-primary" checked={isSelected} disabled={locked} onChange={() => toggle(v.url)} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center">
                      <span className="min-w-0 flex-1 truncate font-medium">{v.title}</span>
                      {score != null && score >= OUTLIER_THRESHOLD && (
                        <span
                          data-testid={`channel-video-outlier-${v.externalId}`}
                          title="Views versus the median of the videos currently listed — not adjusted for video age"
                          className="ml-2 flex-none rounded-full border border-primary/40 px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          {score.toFixed(1)}×
                        </span>
                      )}
                    </p>
                    {meta && <p className="truncate text-xs text-foreground/45">{meta}</p>}
                  </div>
                  {status === "queued" && <span data-testid="channel-video-queued" className="flex-none rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">Queued</span>}
                  {status === "downloaded" && <span data-testid="channel-video-downloaded" className="flex-none rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600">Downloaded</span>}
                </label>
              );
            })}
          </div>
          {/* Floating action bar: pinned to the viewport bottom so it stays reachable with
              hundreds of videos listed. Opaque bg + top border keep the list from bleeding through. */}
          <div className="sticky bottom-0 -mx-8 flex flex-col gap-3 border-t border-border bg-background px-8 py-4">
            <QueueSpecControls onChange={onSpec} />
            <Button data-testid="channel-add-to-queue" onClick={addToQueue} disabled={selected.size === 0}>Add {selected.size} selected to queue</Button>
          </div>
        </>
      )}
    </div>
  );
}
