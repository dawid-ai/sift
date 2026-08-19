import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Link as LinkIcon,
  Plus,
  RefreshCw,
  Rss,
  Trash2,
  Tv,
  type LucideIcon,
} from "lucide-react";
import type { ChannelRecord, SubscriptionRecord } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FIELD } from "@/routes/settings/settings-page";
import { cn, thumbUrl } from "@/lib/utils";
import { ChannelDetail } from "./channel-detail";
import { SubscriptionsTab } from "./subscriptions-tab";

const PILL =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5";

/** Same empty-state treatment as every other surface in this area — one radius, one hairline,
 * one 56px accent-lit icon chip, one measure on the body copy.
 *
 * It sizes to its content (280px floor, 64px of breathing room) rather than stretching to the
 * bottom of the column: a 130px cluster centred inside a 500px outline left ~370px of empty
 * rectangle, which reads as an untethered outline, not a surface. And it sits on the real
 * `.panel` fill — the same layer as the form card above it — instead of a 2% white wash the
 * ambient gradient mottles straight through. */
function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
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
      <p className="relative mt-4 text-[15px] font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </p>
      <p className="relative mx-auto mt-2 max-w-[32ch] text-balance text-[13px] leading-[1.6] text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

/** First letter of a channel name, for the avatar fallback — a missing/blocked avatar should
 * still leave a filled chip so rows stay on the same optical grid. */
function initial(title: string | null | undefined): string {
  const m = (title ?? "").trim().match(/[\p{L}\p{N}]/u);
  return m?.[0]?.toUpperCase() ?? "?";
}

/* Until an avatar loads, the monogram is the row's ONLY identity token — and with eight rows,
   two of them starting "T", eight identical discs contribute nothing to scanning.
   So the disc takes a deterministic tint from the channel's own id.

   Four stops, and all four sit inside ONE warm band (6°–58°) at low saturation, which is the
   whole difference between this and the hue wheel `lib/tag-color.ts` deliberately deleted.
   That wheel was cut because a hue that encodes nothing teaches the eye that colour on this
   surface is decoration — green tag, amber tag, next to a green "Done" status. These are not
   a code: no stop means anything, none of them is reachable from a status hue, and at 7% over
   the disc fill (under the 8% ceiling, so a disc can never compete with the tinted "N new"
   pill on the same row) they read as four shades of the same warm grey. Enough for the column
   to stop being one repeated shape; not enough to be mistaken for information. */
const DISC_TINTS = [
  "bg-[hsl(22_45%_62%/0.07)]",
  "bg-[hsl(42_40%_62%/0.07)]",
  "bg-[hsl(6_35%_62%/0.07)]",
  "bg-[hsl(58_28%_62%/0.07)]",
];

/** Stable index into DISC_TINTS: the same key always yields the same tint, across renders and
 * across the two lists (Channels and Subscribed) that show the same creator. Same hash as
 * `lib/tag-color.ts`, including the modulo-is-always-in-range assertion. Duplicated in
 * `subscriptions-tab.tsx` alongside the `initial` / `Avatar` / `EmptyState` it already
 * mirrors — importing it back the other way would close a cycle between the two files. */
function discTint(key: string | number): string {
  const s = String(key);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return DISC_TINTS[Math.abs(h) % DISC_TINTS.length]!;
}

/** Avatar chip: the initial is painted first and the image sits on top, so a 404 (which the
 * error handler hides) falls back to the letter instead of a hole.
 *
 * The letter reads at `foreground/80` (~8:1). At /40 it measured 3.38:1 at 13px — under the
 * floor, on the one glyph that tells two rows apart. */
function Avatar({
  url,
  title,
  seed,
}: {
  url: string | null;
  title: string;
  seed: string | number;
}) {
  return (
    <span className="relative grid h-11 w-11 flex-none place-items-center overflow-hidden rounded-full border border-border bg-surface-2 text-[13px] font-semibold uppercase text-foreground/80">
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${discTint(seed)}`}
      />
      <span aria-hidden className="relative">
        {initial(title)}
      </span>
      {url && (
        <img
          src={thumbUrl(url)}
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
  );
}

export function ChannelsPage({
  focusChannel,
  onFocusHandled,
  onOpenMedia,
}: {
  focusChannel?: ChannelRecord | null;
  onFocusHandled?: () => void;
  onOpenMedia?: (mediaId: number) => void;
}) {
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [tab, setTab] = useState<"channels" | "subs">("channels");

  // Just the count — the Subscribed tab owns the records themselves and loads them when it
  // mounts. The header has to be able to label both tabs before either one is opened.
  const [subCount, setSubCount] = useState(0);

  const reload = () => window.sift.channels.list().then(setChannels);
  useEffect(() => {
    void reload();
    void window.sift.subscriptions
      .list()
      .then((s) => setSubCount(s.length))
      .catch(() => setSubCount(0));
  }, []);
  useEffect(() => {
    if (focusChannel) {
      setChannels((c) =>
        c.some((x) => x.id === focusChannel.id) ? c : [focusChannel, ...c],
      );
      setOpenId(focusChannel.id);
      onFocusHandled?.();
    }
  }, [focusChannel, onFocusHandled]);

  const add = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await window.sift.channels.add(url.trim());
      setUrl("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const refreshAll = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.sift.channels.refreshAll();
      await reload();
      if (result.failures.length > 0)
        setError(`${result.failures.length} channel(s) failed to refresh`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const refresh = async (id: number) => {
    setError(null);
    try {
      await window.sift.channels.refresh(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const remove = async (id: number) => {
    setError(null);
    try {
      await window.sift.channels.remove(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const importSub = async (sub: SubscriptionRecord) => {
    setError(null);
    try {
      const record = await window.sift.channels.add(sub.url); // upsert; tracked subs return their existing record
      setChannels((c) =>
        c.some((x) => x.id === record.id) ? c : [record, ...c],
      );
      setTab("channels");
      setOpenId(record.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (openId != null) {
    const ch = channels.find((c) => c.id === openId);
    if (ch)
      return (
        <ChannelDetail
          channel={ch}
          onBack={() => setOpenId(null)}
          onOpenMedia={onOpenMedia}
        />
      );
  }

  return (
    // Byte-for-byte the same shell as Queue — same scroll box, same reserved scrollbar gutter,
    // same 1120px column with 40px gutters — so moving between the two routes doesn't shift
    // the page sideways by the width of a scrollbar.
    <main
      data-testid="channels-page"
      className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
    >
      {/* Same single stack as Queue: 32px between every top-level block, declared once, so the
          two routes step down the page at an identical rhythm as well as an identical width. */}
      <div className="mx-auto flex min-h-full w-full max-w-[1120px] flex-col space-y-8 px-10 pb-10 pt-7">
        {/* Header block — eyebrow, title, subtitle and the tab row are one seated unit closed
            by a single hairline, sharing the cards' left edge. */}
        <motion.header
          className="border-b border-border"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <p className="eyebrow">CHANNELS</p>
          <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-foreground">
            The creators you follow.
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Track a channel, pull its latest uploads, and send a batch straight
            to the queue.
          </p>

          {/* Tab bar — same underline treatment as the media detail view, so the app reads as
              one product.

              The inactive tab is one of exactly two destinations on this surface, so it is a
              peer, not a disabled thing. At `foreground/45` it measured 4.25:1 against the
              canvas — under the floor for a 14px navigational label — and beside an active tab
              at 8:1 the pair read as "one tab and something switched off". `muted-foreground`
              is the body-copy rung (7:1) and still sits two clear rungs below the active tab,
              which carries full-strength ink AND the coral underline. */}
          <div className="mt-6 flex gap-5">
            {(
              [
                ["channels", "Channels", Tv],
                ["subs", "Subscribed", Rss],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                data-testid={
                  key === "channels" ? "channels-tab-my" : "channels-tab-subs"
                }
                type="button"
                onClick={() => setTab(key)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors ${
                  tab === key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {/* The active tab is already marked twice — a coral underline and full-strength
                    label text. A third coral marker on the same object (and a fourth on its
                    count) is how this screen ended up spending the accent nine times while the
                    one real action, "Add channel", spent it once. The count is information, so
                    it reads the same neutral in both states: which tab you are on is the
                    underline's job, and a number that restyles itself on a state it does not
                    report was a second, weaker copy of that signal. */}
                <Icon aria-hidden className="h-3.5 w-3.5" />
                {label}
                {/* BOTH tabs report, or neither does. A count on Channels alone said
                    "Channels 9 / Subscribed" — which reads as "the other one is empty"
                    rather than "the other one hasn't been counted", and it is the wrong
                    answer whenever it isn't. The subscription count is one cheap list call
                    the page already has an IPC surface for. */}
                {(key === "channels" ? channels.length : subCount) > 0 && (
                  <span className="rounded-full bg-foreground/10 px-1.5 text-xs tabular-nums text-foreground/70">
                    {key === "channels" ? channels.length : subCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </motion.header>

        {error && (
          <p className="rounded-xl border border-danger/25 bg-danger/12 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        {tab === "subs" ? (
          <SubscriptionsTab onImport={importSub} />
        ) : (
          <>
            {/* The one rim-lit surface on this view: where a channel enters the app. */}
            <section className="panel-lit px-6 py-5">
              {/* `accent-muted` by name, not a fraction of `primary`: it is the token that
                  exists for this decorative rung, and it cannot drift when the CTA hue moves. */}
              <p className="eyebrow text-[10px] tracking-[0.16em] text-accent-muted">
                TRACK A CHANNEL
              </p>
              {/* The heading is the card's only heading slot, so it may not spend it repeating
                  the field's own placeholder 40px below it — nor the eyebrow 20px above it.
                  "TRACK A CHANNEL" over "Track a creator" was the same sentence stacked
                  twice; the eyebrow names the section, the heading says what tracking does. */}
              <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                Watch a creator for new uploads
              </h2>
              {/* Field, then the action pair. One 12px step everywhere in the row — field to
                  buttons and button to button — which is the same step the Queue route's
                  primary/secondary pair uses. At 8px the pair welded into a single slab
                  against the card's 24px padding, so the two screens rendered the same two
                  objects at two different rhythms. Both buttons are the plain Button primitive
                  at the area's one action height (44px, default padding, leading icon). */}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {/* The shared <Input> + FIELD, not a 300-character re-roll of them. The
                    hand-rolled shell had already drifted from the primitive in three places —
                    its own hairline alpha, no inset recess, a keyboard focus ring at 15% that
                    is not a focus indicator, and a placeholder at `muted-foreground/75`
                    (3.7:1) instead of the `--placeholder` token every other field in the app
                    reads from. One field object, one definition. */}
                <div className="relative h-11 min-w-[240px] flex-1">
                  <LinkIcon
                    aria-hidden
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/35"
                  />
                  <Input
                    data-testid="channels-add-url"
                    className={cn(FIELD, "pl-11")}
                    placeholder="youtube.com/@handle or channel URL"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void add();
                    }}
                  />
                </div>
                <div className="flex flex-none items-center gap-3">
                  <Button
                    data-testid="channels-add"
                    className="h-11"
                    onClick={add}
                    disabled={busy}
                  >
                    <Plus aria-hidden className="h-4 w-4" />
                    Add channel
                  </Button>
                  {/* "Refresh all" refreshes the tracked list, so with nothing tracked it is not
                      a disabled control — it is a control with no subject yet. Held disabled it
                      still occupied the page's only action row, immediately right of the coral
                      primary, painting a 2.3:1 grey label that reads as a broken button rather
                      than an unavailable one. It appears with the thing it acts on; until then
                      the row is one field and one CTA. */}
                  {channels.length > 0 && (
                    <Button
                      data-testid="channels-refresh-all"
                      variant="outline"
                      className="h-11"
                      onClick={refreshAll}
                      disabled={busy}
                    >
                      <RefreshCw aria-hidden className="h-4 w-4" />
                      Refresh all
                    </Button>
                  )}
                </div>
              </div>
            </section>

            {/* Empty and populated are mutually exclusive — exactly one of them renders, so the
                page never shows "nothing here" and placeholder rows at the same time. */}
            {channels.length === 0 ? (
              <EmptyState
                icon={Tv}
                title="No channels yet"
                body="Add one above, or import from the Subscribed tab."
              />
            ) : (
              <section className="panel overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2/40 px-5 py-3">
                  <p className="eyebrow">Tracked</p>
                  <span
                    className={`${PILL} border-foreground/[0.12] bg-foreground/[0.06] text-muted-foreground`}
                  >
                    <span className="tabular-nums">{channels.length}</span>
                    {channels.length === 1 ? "channel" : "channels"}
                  </span>
                </div>

                {channels.map((c) => {
                  const meta = [
                    c.handle,
                    c.videoCount != null
                      ? `${c.videoCount.toLocaleString()} videos`
                      : null,
                    c.followerCount != null
                      ? `${c.followerCount.toLocaleString()} subs`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div
                      data-testid="channel-row"
                      key={c.id}
                      className="group flex items-center gap-3.5 border-b border-border px-5 py-3.5 transition-colors last:border-b-0 hover:bg-foreground/[0.03]"
                    >
                      <Avatar
                        url={c.avatarUrl}
                        title={c.title}
                        seed={c.channelId}
                      />
                      <button
                        type="button"
                        className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        onClick={() => setOpenId(c.id)}
                      >
                        <p className="truncate text-sm font-semibold text-foreground/90 transition-colors group-hover:text-foreground">
                          {c.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {meta}
                        </p>
                      </button>
                      {/* A count of new uploads is information, not an action. Five of these
                          stacked down the right rail in the CTA's own hue out-weighed the one
                          button on the page, so the eye landed on the rail instead of on "Add
                          channel". The dot keeps the "there's something new" read without
                          spending coral on every row: `accent-muted` is the token that exists
                          for exactly this — warm, 3:1-clear, not the CTA. */}
                      {c.newCount > 0 && (
                        <span
                          data-testid="channel-new-badge"
                          className={`${PILL} flex-none border-foreground/[0.12] bg-foreground/[0.06] text-foreground/85`}
                        >
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 rounded-full bg-accent-muted"
                          />
                          <span className="tabular-nums">{c.newCount} new</span>
                        </span>
                      )}
                      {/* Same row-action cluster as Queue: 32px ghost buttons, 3.5px glyphs,
                          gap-1, full opacity. The `opacity-70` wrapper was a multiplier on top
                          of an already-muted primitive — it pushed both glyphs toward the 3:1
                          floor for no gain the primitive's own hover state doesn't give. */}
                      <div className="flex flex-none items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Refresh ${c.title}`}
                          title="Refresh"
                          onClick={() => void refresh(c.id)}
                        >
                          <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          data-testid="channel-remove"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${c.title}`}
                          title="Remove"
                          className="hover:bg-danger/12 hover:text-danger"
                          onClick={() => remove(c.id)}
                        >
                          <Trash2 aria-hidden className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
