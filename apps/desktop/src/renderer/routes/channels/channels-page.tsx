import { useEffect, useState } from "react";
import type { ChannelRecord, SubscriptionRecord } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { thumbUrl } from "@/lib/utils";
import { ChannelDetail } from "./channel-detail";
import { SubscriptionsTab } from "./subscriptions-tab";

export function ChannelsPage({ focusChannel, onFocusHandled, onOpenMedia }: { focusChannel?: ChannelRecord | null; onFocusHandled?: () => void; onOpenMedia?: (mediaId: number) => void }) {
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [tab, setTab] = useState<"channels" | "subs">("channels");

  const reload = () => window.sift.channels.list().then(setChannels);
  useEffect(() => { void reload(); }, []);
  useEffect(() => {
    if (focusChannel) { setChannels((c) => (c.some((x) => x.id === focusChannel.id) ? c : [focusChannel, ...c])); setOpenId(focusChannel.id); onFocusHandled?.(); }
  }, [focusChannel, onFocusHandled]);

  const add = async () => {
    if (!url.trim()) return;
    setBusy(true); setError(null);
    try { await window.sift.channels.add(url.trim()); setUrl(""); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const refreshAll = async () => {
    setBusy(true); setError(null);
    try {
      const result = await window.sift.channels.refreshAll();
      await reload();
      if (result.failures.length > 0) setError(`${result.failures.length} channel(s) failed to refresh`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const refresh = async (id: number) => {
    setError(null);
    try { await window.sift.channels.refresh(id); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const remove = async (id: number) => {
    setError(null);
    try { await window.sift.channels.remove(id); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const importSub = async (sub: SubscriptionRecord) => {
    setError(null);
    try {
      const record = await window.sift.channels.add(sub.url); // upsert; tracked subs return their existing record
      setChannels((c) => (c.some((x) => x.id === record.id) ? c : [record, ...c]));
      setTab("channels");
      setOpenId(record.id);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  if (openId != null) {
    const ch = channels.find((c) => c.id === openId);
    if (ch) return <ChannelDetail channel={ch} onBack={() => setOpenId(null)} onOpenMedia={onOpenMedia} />;
  }

  return (
    <div data-testid="channels-page" className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-8">
      <div className="flex gap-5 border-b border-border">
        {([["channels", "Channels"], ["subs", "Subscribed"]] as const).map(([key, label]) => (
          <button
            key={key}
            data-testid={key === "channels" ? "channels-tab-my" : "channels-tab-subs"}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors ${
              tab === key ? "border-primary text-foreground" : "border-transparent text-foreground/45 hover:text-foreground/75"
            }`}
          >
            {label}
            {key === "channels" && channels.length > 0 && (
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${tab === key ? "bg-primary/15 text-primary" : "bg-foreground/10 text-foreground/50"}`}>
                {channels.length}
              </span>
            )}
          </button>
        ))}
      </div>
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-500">{error}</p>}
      {tab === "subs" ? (
        <SubscriptionsTab onImport={importSub} />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input data-testid="channels-add-url" className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" placeholder="Paste a channel URL (youtube.com/@handle)" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
            <Button data-testid="channels-add" onClick={add} disabled={busy}>Add channel</Button>
            <Button data-testid="channels-refresh-all" variant="outline" onClick={refreshAll} disabled={busy || channels.length === 0}>Refresh all</Button>
          </div>
          <div className="flex flex-col gap-2">
            {channels.length === 0 && (
              <p className="rounded-xl border border-dashed border-border px-3 py-10 text-center text-sm text-foreground/50">
                No channels yet. Paste a YouTube channel URL above to track it.
              </p>
            )}
            {channels.map((c) => (
              <div data-testid="channel-row" key={c.id} className="group flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-foreground/20">
                {c.avatarUrl && <img src={thumbUrl(c.avatarUrl)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="h-11 w-11 flex-none rounded-full object-cover" />}
                <button className="flex-1 overflow-hidden text-left" onClick={() => setOpenId(c.id)}>
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="truncate text-xs text-foreground/50">{c.handle ?? ""}{c.videoCount != null ? ` · ${c.videoCount} videos` : ""}{c.followerCount != null ? ` · ${c.followerCount.toLocaleString()} subs` : ""}</p>
                </button>
                {c.newCount > 0 && <span data-testid="channel-new-badge" className="flex-none rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">{c.newCount} new</span>}
                <div className="flex flex-none items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                  <button type="button" onClick={() => void refresh(c.id)} className="rounded-md px-2 py-1 text-xs text-foreground/60 hover:bg-foreground/5 hover:text-foreground">Refresh</button>
                  <button type="button" data-testid="channel-remove" onClick={() => remove(c.id)} className="rounded-md px-2 py-1 text-xs text-foreground/60 hover:bg-red-500/10 hover:text-red-500">Remove</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
