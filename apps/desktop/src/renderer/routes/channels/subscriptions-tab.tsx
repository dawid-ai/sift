import { useEffect, useState } from "react";
import { RefreshCw, Rss, Search, type LucideIcon } from "lucide-react";
import type { SubscriptionRecord } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { FIELD } from "@/routes/settings/settings-page";
import { thumbUrl } from "@/lib/utils";

const PILL =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5";

/** The area's single empty-state treatment — identical radius, hairline, icon chip, measure
 * and 280px content-sized height to the Channels and Queue ones. Sized to its content and
 * seated on the real `.panel` fill, so it terminates on a card edge rather than stretching
 * into a tall outlined void the ambient gradient shows through. */
function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="panel relative flex min-h-[280px] flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(58%_54%_at_50%_36%,hsl(var(--primary)/0.055),transparent_72%)]"
      />
      <span
        aria-hidden
        className="relative grid h-14 w-14 place-items-center rounded-full border border-foreground/10 bg-foreground/[0.05] text-primary/60"
      >
        <Icon strokeWidth={1.5} className="h-6 w-6" />
      </span>
      <p className="relative mt-4 text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</p>
      <p className="relative mx-auto mt-2 max-w-[32ch] text-balance text-[13px] leading-[1.6] text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

/** First letter of a channel name, for the avatar fallback. */
function initial(title: string | null | undefined): string {
  const m = (title ?? "").trim().match(/[\p{L}\p{N}]/u);
  return m?.[0]?.toUpperCase() ?? "?";
}

/* The same four disc tints the Channels rows use, keyed off the same channel id and hashed the
   same way, so a creator keeps one disc colour whether you meet them here or in the tracked
   list. All four sit in one warm band at low saturation and 7% alpha — four shades of the same
   warm grey, not a code (see the note in `channels-page.tsx`). Kept local, mirroring the
   `initial` / `Avatar` / `EmptyState` this file already duplicates: importing them from
   `channels-page` would close a cycle, since that file renders this one. */
const DISC_TINTS = [
  "bg-[hsl(22_45%_62%/0.07)]",
  "bg-[hsl(42_40%_62%/0.07)]",
  "bg-[hsl(6_35%_62%/0.07)]",
  "bg-[hsl(58_28%_62%/0.07)]",
];

function discTint(key: string | number): string {
  const s = String(key);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  // Index is always in [0, length) via the modulo, so the assertion is safe.
  return DISC_TINTS[Math.abs(h) % DISC_TINTS.length]!;
}

/** Avatar chip: initial underneath, image on top — a blocked avatar degrades to the letter
 * instead of leaving a hole in the row.
 *
 * Same object as the Channels row's avatar, tint and all — including `discTint`, so a creator
 * you follow keeps one colour whether you meet them here or in the tracked list. The letter
 * sits at `foreground/80` (~8:1); at /40 it was 3.38:1 at 13px, which turned a column of
 * monograms into a column of identical grey discs. */
function Avatar({ url, title, seed }: { url: string | null; title: string; seed: string | number }) {
  return (
    <span className="relative grid h-11 w-11 flex-none place-items-center overflow-hidden rounded-full border border-border bg-surface-2 text-[13px] font-semibold uppercase text-foreground/80">
      <span aria-hidden className={`pointer-events-none absolute inset-0 ${discTint(seed)}`} />
      <span aria-hidden className="relative">{initial(title)}</span>
      {url && (
        <img
          src={thumbUrl(url)}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}

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
    <div data-testid="subscriptions-tab" className="flex min-h-0 flex-1 flex-col gap-8">
      <section className="panel-lit px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {/* Eyebrow announces, title is the heading, caption explains — one step down each.
                The eyebrow takes `accent-muted` by name, the same as every other card eyebrow
                in this area, instead of a fraction of the CTA hue. */}
            <p className="eyebrow text-[10px] tracking-[0.16em] text-accent-muted">FROM YOUR ACCOUNT</p>
            <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
              The channels you already follow
            </h2>
            <p className="mt-1.5 text-[13px] leading-[1.6] text-muted-foreground">
              Reads your YouTube subscriptions using your sign-in.
            </p>
          </div>
          <Button data-testid="subscriptions-sync" className="h-11 flex-none" onClick={sync} disabled={busy}>
            <RefreshCw aria-hidden className={`h-4 w-4 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`} />
            {busy ? "Syncing…" : "Sync subscriptions"}
          </Button>
        </div>

        {subs.length > 0 && (
          <div className="relative mt-4">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/35" />
            <input
              type="search"
              placeholder="Search subscriptions…"
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
              className={`h-11 w-full rounded-xl border ${FIELD} pl-11 pr-3.5 text-sm text-foreground transition-colors focus:outline-none [&::-webkit-search-cancel-button]:cursor-pointer [&::-webkit-search-cancel-button]:opacity-45 [&::-webkit-search-cancel-button]:invert`}
            />
          </div>
        )}
      </section>

      {error && (
        <p className="rounded-xl border border-danger/25 bg-danger/12 px-4 py-3 text-sm text-danger">{error}</p>
      )}

      {/* One state at a time: the empty panel stands alone, with no placeholder rows under it. */}
      {subs.length === 0 && !error && (
        <EmptyState
          icon={Rss}
          title="No subscriptions yet"
          body="Sign in to YouTube in Settings → Sign-in browser, then Sync."
        />
      )}

      {subs.length > 0 && shown.length === 0 && (
        <EmptyState
          icon={Search}
          title="Nothing matches that search"
          body="Try a shorter query, or clear the search to see every subscription."
        />
      )}

      {shown.length > 0 && (
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2/40 px-5 py-3">
            <p className="eyebrow">Subscribed</p>
            <span className={`${PILL} border-foreground/[0.12] bg-foreground/[0.06] text-muted-foreground`}>
              <span className="tabular-nums">{shown.length}</span>
              {shown.length === 1 ? "channel" : "channels"}
            </span>
          </div>

          {shown.map((s) => {
            const meta = [
              s.handle,
              s.followerCount != null ? `${s.followerCount.toLocaleString()} subs` : null,
            ].filter(Boolean).join(" · ");
            return (
              <div
                data-testid="subscription-row"
                key={s.channelId}
                className="group flex items-center gap-3.5 border-b border-border px-5 py-3.5 transition-colors last:border-b-0 hover:bg-foreground/[0.03]"
              >
                <Avatar url={s.avatarUrl} title={s.title} seed={s.channelId} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground/90 transition-colors group-hover:text-foreground">{s.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
                </div>
                {s.tracked && (
                  <span className={`${PILL} flex-none border-success/25 bg-success/12 text-success`}>Tracked</span>
                )}
                {s.tracked
                  ? <Button data-testid="subscription-open" size="sm" variant="outline" className="flex-none" onClick={() => onImport(s)}>Get videos</Button>
                  : <Button data-testid="subscription-add" size="sm" className="flex-none" onClick={() => onImport(s)}>Get videos</Button>}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
