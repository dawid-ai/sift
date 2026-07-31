import { useEffect, useState } from "react";
import type { SubscriptionRecord } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { thumbUrl } from "@/lib/utils";

/** onImport receives the sub the user chose; the parent adds it (if needed) and focuses it in My channels. */
export function SubscriptionsTab({ onImport }: { onImport: (sub: SubscriptionRecord) => void }) {
  const [subs, setSubs] = useState<SubscriptionRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => { void window.sift.subscriptions.list().then(setSubs); }, []);

  const sync = async () => {
    setBusy(true); setError(null);
    try { setSubs(await window.sift.subscriptions.sync()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const shown = subs.filter((s) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return (s.title ?? "").toLowerCase().includes(t) || (s.handle ?? "").toLowerCase().includes(t);
  });

  return (
    <div data-testid="subscriptions-tab" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button data-testid="subscriptions-sync" onClick={sync} disabled={busy}>
          {busy ? "Syncing…" : "Sync subscriptions"}
        </Button>
        <span className="text-xs text-foreground/50">Reads your YouTube subscriptions using your sign-in.</span>
      </div>
      {subs.length > 0 && (
        <input
          type="search"
          placeholder="Search subscriptions…"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      )}
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-500">{error}</p>}
      {subs.length === 0 && !error && (
        <p className="rounded-xl border border-dashed border-border px-3 py-10 text-center text-sm text-foreground/50">
          No subscriptions yet. Sign in to YouTube in Settings → Sign-in browser, then Sync.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {shown.map((s) => (
          <div data-testid="subscription-row" key={s.channelId} className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-foreground/20">
            {s.avatarUrl && <img src={thumbUrl(s.avatarUrl)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="h-11 w-11 flex-none rounded-full object-cover" />}
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium">{s.title}</p>
              <p className="truncate text-xs text-foreground/50">
                {s.handle ?? ""}{s.followerCount != null ? ` · ${s.followerCount.toLocaleString()} subs` : ""}
              </p>
            </div>
            {s.tracked
              ? <Button data-testid="subscription-open" size="sm" variant="outline" onClick={() => onImport(s)}>Get videos</Button>
              : <Button data-testid="subscription-add" size="sm" onClick={() => onImport(s)}>Get videos</Button>}
          </div>
        ))}
      </div>
    </div>
  );
}
