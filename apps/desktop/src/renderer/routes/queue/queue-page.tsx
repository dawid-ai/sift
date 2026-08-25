import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Ban,
  Captions,
  ChevronDown,
  CircleCheck,
  CircleX,
  Clock,
  ExternalLink,
  Inbox,
  Pause,
  Play,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { QueueConfig, QueueItem, QueueSpec } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { QueueSpecControls } from "@/components/queue-spec-controls";
import { FIELD } from "@/routes/settings/settings-page";

/** Short human label for the selected download format, e.g. "1080p MP4", "Video & Audio", "Audio only". */
function formatLabel(f: QueueSpec["format"]): string {
  if (f.kind === "audio") return "Audio only";
  const res = f.maxHeight ? `${f.maxHeight}p` : "Video & Audio";
  return f.mp4 ? `${res} · MP4` : res;
}

/** True when the item's download op failed — nothing was captured, so it's a failure, not a "done". */
function isFailed(it: QueueItem): boolean {
  return it.status === "done" && it.ops?.download === "error";
}

/** "failed" / "done · 1 issue" / "done" status text from a queue item. */
function statusText(it: QueueItem): string {
  if (it.status !== "done" || !it.ops)
    return it.status === "running" ? "downloading" : it.status;
  if (isFailed(it)) return "failed";
  // Download succeeded (or was skipped); a transcript/summarize error is a partial issue.
  const issues = (["download", "transcript", "summarize"] as const).filter(
    (k) => it.ops![k] === "error",
  ).length;
  return issues > 0 ? `done · ${issues} issue${issues > 1 ? "s" : ""}` : "done";
}

function hasError(it: QueueItem): boolean {
  return Boolean(
    it.ops &&
    (["download", "transcript", "summarize"] as const).some(
      (k) => it.ops![k] === "error",
    ),
  );
}

/** Strips yt-dlp's noisy "Command failed: <huge command>" prefix, keeping the real "ERROR: …". */
function cleanErr(m: string): string {
  const i = m.indexOf("ERROR:");
  return (i >= 0 ? m.slice(i) : m).replace(/\s+/g, " ").trim();
}

/** One readable line per failed op, e.g. "transcript: ERROR: … Requested format is not available". */
function issueLines(it: QueueItem): string[] {
  const lines: string[] = [];
  if (it.ops) {
    for (const k of ["download", "transcript", "summarize"] as const) {
      if (it.ops[k] !== "error") continue;
      const raw = it.ops.messages?.[k] ?? it.error ?? "";
      lines.push(`${k}: ${raw ? cleanErr(raw) : "failed"}`);
    }
  }
  if (lines.length === 0 && it.error) lines.push(cleanErr(it.error));
  return lines;
}

/* ------------------------------------------------------------------------------------------
   Presentation only below. A queue row's whole story is its state, so the state gets the
   loudest element on the row: a tinted status pill (icon + text) whose hue is the single
   source of truth for "is this fine or not" — success / warning / danger, with white-alpha
   for the neutral waiting/canceled states so the palette still means something.
   ------------------------------------------------------------------------------------------ */

type Tone = "queued" | "running" | "done" | "issues" | "failed" | "canceled";

/* ------------------------------------------------------------------------------------------
   THE "IN PROGRESS" HUE.

   Running used to be painted in `--primary`. Coral is documented (globals.css) as being spent
   on exactly three things — the brand mark, the active nav item and the primary CTA — and this
   route had it on nine: the runner chip, the RUNNING counter tile, the status pill and format
   chip on *every* row, the progress bar, its percentage, and the CTA. Five passive signals
   out-voting one button is how an accent stops meaning "act here".

   So "work is happening" gets a hue of its own — but it has to be a hue the palette OWNS.
   The first cut spelled out hsl(210 90% 58%), a saturated azure, on the grounds that
   globals.css had no `--info` rung. That solved the coral problem by inventing a sixth hue:
   Ember is bg/rail/surface/border/fg plus coral, violet, green, amber and rose, and a blue
   progress bar made this one route read as a different product.

   `--accent-muted` is the rung that already exists for exactly this job: hsl(20 58% 55%),
   documented as "the brand's warmth without spending the CTA hue", used by the eyebrow on
   this route's own composer. Every running signal (tile, row pill, progress fill, percentage)
   reads from these four constants, so the page raises one hue for "in progress" and keeps
   full-saturation coral for the one button that acts.
   ------------------------------------------------------------------------------------------ */
const INFO_TEXT = "text-accent-muted";
const INFO_BORDER = "border-accent-muted/30";
const INFO_FILL = "bg-accent-muted/[0.14]";
const INFO_BAR =
  "bg-[linear-gradient(90deg,hsl(var(--accent-muted)),hsl(28_70%_64%))]";

function itemTone(it: QueueItem): Tone {
  if (it.status === "canceled") return "canceled";
  if (it.status === "queued") return "queued";
  if (it.status === "running") return "running";
  if (isFailed(it)) return "failed";
  return hasError(it) ? "issues" : "done";
}

const TONES: Record<Tone, { pill: string; icon: LucideIcon }> = {
  queued: {
    pill: "border-foreground/[0.12] bg-foreground/[0.06] text-muted-foreground",
    icon: Clock,
  },
  running: {
    pill: `${INFO_BORDER} ${INFO_FILL} ${INFO_TEXT}`,
    icon: Activity,
  },
  done: {
    pill: "border-success/25 bg-success/12 text-success",
    icon: CircleCheck,
  },
  issues: {
    pill: "border-warning/25 bg-warning/12 text-warning",
    icon: TriangleAlert,
  },
  failed: {
    pill: "border-danger/25 bg-danger/12 text-danger",
    icon: CircleX,
  },
  // Quiet, but readable: `fg-subtle` is the documented "announces, then recedes" rung at
  // 4.6:1, one step below the `muted-foreground` the `queued` pill takes. It was
  // `foreground/45`, which composites to 4.13:1 on the row — under the floor for a 10px
  // label, on the one state the counter strip now has a whole tile for.
  canceled: {
    pill: "border-foreground/[0.12] bg-foreground/[0.04] text-fg-subtle",
    icon: Ban,
  },
};

/** Host of a queued URL, for the neutral source pill ("youtube.com"). Never throws. */
function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "link";
  } catch {
    return "link";
  }
}

/** The part of the URL the source pill does NOT already say.
 *
 * It used to be the whole URL minus its protocol, which made the row's most prominent line
 * open with the same eight characters the neutral pill 30px above it had just stated —
 * "youtube.com" in the pill, "youtube.com/watch?v=…" as the title. The pill owns the host, so
 * the title owns the rest; a bare host (nothing after the slash) keeps the host, because a
 * row reading "/" would say less than nothing. `QueueItem` carries no fetched title, so this
 * is the most specific thing the row can be given without asking the main process for more. */
function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    const rest = `${u.pathname}${u.search}`;
    return rest === "" || rest === "/"
      ? u.hostname.replace(/^www\./, "")
      : rest;
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, "");
  }
}

/** The URL as the row's HEADLINE, used until a title lands.
 *
 * `displayUrl` drops the host because the pill above it already says the host — right for a
 * caption under a title, wrong for the line that IS the item's name. A rule-queued video has
 * no title until its metadata fetch lands, so those rows read as a bare "/watch?v=Iltb4hn8v_Y"
 * with nothing to copy and nothing to recognise. Here the whole address is spelt out. */
function headlineUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

const PILL =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5";
const NEUTRAL_PILL = `${PILL} border-foreground/[0.12] bg-foreground/[0.06] text-muted-foreground`;

/* Counter tiles are the only *elevated* surface on this view: a top-lit white-alpha fill
   (not the page value with a hairline on it), an inset top highlight and a deep drop so the
   card sits above the atmosphere rather than being cut out of it.

   Colour here is earned by the *value*, never by the slot. A tile reading 0 is reporting
   nothing, so it renders neutral: one hairline, one muted label weight, one muted icon, no
   tinted wash — which is also what stops "Queued" from being the odd tile out at rest, since
   at rest all four are identical. The hue (border + label + a faint top-anchored wash of the
   same hue) only switches on once the count is non-zero, so the strip raises exactly as many
   signals as there are things actually happening. */
type StatTone = { border: string; label: string; wash: string; chip: string };

/** The zero state every tile falls back to. One weight, one colour, one hairline. */
const STAT_IDLE: StatTone = {
  border: "border-foreground/[0.08]",
  label: "text-muted-foreground",
  wash: "",
  chip: "bg-foreground/[0.06] text-muted-foreground",
};

const STAT_TONES: Record<
  "queued" | "running" | "done" | "attention",
  StatTone
> = {
  // Waiting is not a status hue — a non-empty backlog steps up in white, not in colour.
  queued: {
    border: "border-foreground/[0.16]",
    label: "text-foreground/85",
    wash: "bg-[radial-gradient(125%_92%_at_50%_0%,hsl(var(--foreground)/0.05),transparent_70%)]",
    chip: "bg-foreground/[0.10] text-foreground/75",
  },
  // Not coral: see THE "IN PROGRESS" HUE above. The RUNNING tile, the running row pill and the
  // progress bar are one signal in three places, so they share one hue — and it is not the
  // hue of the button underneath them.
  running: {
    border: INFO_BORDER,
    label: INFO_TEXT,
    wash: "bg-[radial-gradient(125%_92%_at_50%_0%,hsl(var(--accent-muted)/0.13),transparent_70%)]",
    chip: `${INFO_FILL} ${INFO_TEXT}`,
  },
  done: {
    border: "border-success/30",
    label: "text-success",
    wash: "bg-[radial-gradient(125%_92%_at_50%_0%,hsl(var(--success)/0.10),transparent_70%)]",
    chip: "bg-success/15 text-success",
  },
  attention: {
    border: "border-warning/30",
    label: "text-warning",
    wash: "bg-[radial-gradient(125%_92%_at_50%_0%,hsl(var(--warning)/0.10),transparent_70%)]",
    chip: "bg-warning/15 text-warning",
  },
};

const STAT_SHELL =
  "relative overflow-hidden rounded-2xl border bg-gradient-to-b from-foreground/[0.055] to-foreground/[0.015] px-5 py-4 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.07),0_10px_28px_-16px_hsl(0_0%_0%/0.85)]";

/**
 * A counter tile. Three typographic tiers, in order: the numeral (34px, tabular), then the
 * label, then the caption that explains the label. Colour follows the same order, so the
 * explainer never outweighs the thing it explains. Label and icon share
 * one baseline row so all four tiles line up across the strip. `tone` is the tile's tone
 * *when it has something to report*; at zero it falls back to the shared idle treatment, so
 * an empty session shows four identical calm cards rather than four different alarms. Every
 * value comes straight off the items already in state; nothing here is fetched or invented.
 */
function StatTile({
  label,
  value,
  caption,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  caption: string;
  icon: LucideIcon;
  tone: StatTone;
}) {
  const t = value > 0 ? tone : STAT_IDLE;
  return (
    <div className={`${STAT_SHELL} ${t.border}`}>
      {t.wash && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 ${t.wash}`}
        />
      )}
      <div className="relative flex items-center justify-between gap-2">
        <p
          className={`text-[11px] font-semibold uppercase leading-none tracking-[0.08em] ${t.label}`}
        >
          {label}
        </p>
        <span
          aria-hidden
          className={`grid h-5 w-5 flex-none place-items-center rounded-md ${t.chip}`}
        >
          <Icon strokeWidth={1.5} className="h-3.5 w-3.5" />
        </span>
      </div>
      {/* The numeral earns its ink the same way the border and the label do. A tile reading 0
          is reporting nothing, so a pure-white 34px zero would be the brightest thing on a
          page that has nothing to say; it steps back to the tertiary rung until there is
          actually something to count. */}
      <p
        className={`relative mt-3 text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${
          value > 0 ? "text-foreground" : "text-foreground/35"
        }`}
      >
        {value}
      </p>
      {/* Three tiers, not two: numeral → label → caption. The caption explains the label, so
          it has to sit *below* it on both size and colour — at 13px/muted it was physically
          larger than the thing it explained and painted in the same grey. */}
      <p className="relative mt-2 text-[12px] leading-[1.35] text-fg-subtle">
        {caption}
      </p>
    </div>
  );
}

/**
 * The one empty-state treatment used by every surface in this area — same radius, same
 * hairline, same 56px accent-lit icon chip, same measure on the body copy — so "nothing here
 * yet" looks like one deliberate component rather than a per-route improvisation.
 *
 * It sizes to its content (280px floor, 64px of breathing room) instead of stretching into
 * whatever height the column has left: a 130px cluster centred in a 500px outline is 370px of
 * void, and it reads as an untethered rectangle rather than a surface. It also sits on the
 * real `.panel` fill, not a 2% white wash over the canvas, so it belongs to the same layer as
 * the card above it and the ambient gradient can't mottle through it.
 */
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

/**
 * Runner state and the control that changes it — one object, rendered once, filed with the
 * list it governs.
 *
 * It used to live in the composer: an "ACTIVE" chip pinned to the top-right of the card headed
 * NEW BATCH, and a Pause sitting as the secondary of "Add to queue". Neither describes
 * composing a batch — both describe the list 220px below, which meant the card answered two
 * different questions and the runner's state was invisible the moment you scrolled to the work
 * it actually governs. Its home is the "In queue" panel header; it only falls back to the
 * composer while the queue is empty and that panel does not exist yet, because a runner you
 * can only pause once something is already running would be a *different control*, not a
 * restyled one.
 *
 * The chip is neutral with a status dot instead of a tinted coral pill: "is the runner going"
 * is a state, and it was spending the CTA's hue a few hundred pixels above the CTA.
 */
function RunnerControls({
  paused,
  onToggle,
}: {
  paused: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-none items-center gap-2.5">
      <span
        className={`inline-flex h-6 flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-foreground/[0.12] bg-foreground/[0.06] px-2.5 text-[11px] font-medium uppercase leading-none tracking-[0.08em] ${
          paused ? "text-warning" : "text-muted-foreground"
        }`}
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${
            paused
              ? "bg-warning shadow-[0_0_6px_hsl(var(--warning)/0.6)]"
              : "bg-success shadow-[0_0_6px_hsl(var(--success)/0.6)]"
          }`}
        />
        {paused ? "Paused" : "Active"}
      </span>
      {/* Same object as the panel-header controls on Channel detail — `sm` + `outline` — so a
          control sitting in a section header is one shape across this area. */}
      <Button
        data-testid="queue-pause"
        size="sm"
        variant="outline"
        onClick={onToggle}
      >
        {paused ? (
          <Play aria-hidden className="h-3.5 w-3.5" />
        ) : (
          <Pause aria-hidden className="h-3.5 w-3.5" />
        )}
        {paused ? "Resume" : "Pause"}
      </Button>
    </div>
  );
}

/** The batch spec as one readable line — what the *collapsed* spec row reads back, so folding
 *  the controls away never hides what they are currently set to. Derived from the same spec
 *  object the page already holds; nothing here is queried or invented.
 *
 *  Every field reports in both directions. It used to print "Transcribe off" but drop
 *  summarize entirely when off, so of two sibling toggles rendered 8px apart only one was
 *  reportable at rest — a reader scanning the folded line could not tell "Summarize is off"
 *  from "this line doesn't mention summarize". The only asymmetric entry left is quality, and
 *  that one is real: an audio-only batch has no resolution to state. */
function specLine(s: QueueSpec | null): string {
  if (!s) return "Default batch settings";
  const audio = s.format.kind === "audio";
  return [
    audio ? "Audio only" : "Video & audio",
    audio
      ? null
      : s.format.maxHeight
        ? `Max ${s.format.maxHeight}p`
        : "Best available",
    s.transcript ? "Transcribe on" : "Transcribe off",
    s.summarize ? "Summarize on" : "Summarize off",
    s.tags.length > 0
      ? `${s.tags.length} tag${s.tags.length > 1 ? "s" : ""}`
      : "No tags",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "02:30" → the next epoch ms at that local clock time. Resolving it here rather than in
 * the main process keeps every timezone and DST question inside the one process that has a
 * user-facing clock. */
function nextOccurrence(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  const at = new Date();
  at.setHours(h ?? 0, m ?? 0, 0, 0);
  if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/** Epoch ms → "02:30", for the `<input type="time">` value. */
function toClock(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [urls, setUrls] = useState("");
  const [spec, setSpec] = useState<QueueSpec | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSpecChange = useCallback((s: QueueSpec) => setSpec(s), []);

  useEffect(() => {
    window.sift.queue.list().then(setItems);
    window.sift.queue.isPaused().then(setPaused);
    return window.sift.queue.onUpdate(setItems);
  }, []);

  /* Derived from the snapshot already in state — no extra IPC, no invented figures.
     EXHAUSTIVE, deliberately: every tone `itemTone` can return has a bucket here. It didn't —
     `canceled` was counted by no tile — so a cancelled item existed in the list, and in the
     panel's count pill, and nowhere in the summary 32px above it: the strip read 3+1+2+1=7
     against "8 items". Two numbers describing one set, disagreeing, in the band a user reads
     first. `total` below is now the single expression both the strip and the pill are derived
     from, so they cannot drift apart again whatever tones get added later. */
  const counts = useMemo(() => {
    const c = { queued: 0, running: 0, done: 0, attention: 0, canceled: 0 };
    for (const it of items) {
      const tone = itemTone(it);
      if (tone === "queued") c.queued += 1;
      else if (tone === "running") c.running += 1;
      else if (tone === "done") c.done += 1;
      else if (tone === "canceled") c.canceled += 1;
      else if (tone === "issues" || tone === "failed") c.attention += 1;
    }
    return c;
  }, [items]);
  const total =
    counts.queued +
    counts.running +
    counts.done +
    counts.attention +
    counts.canceled;

  /* The spec row folds away once the batch defaults are set. Composing occupied 378px of a
     900px viewport — 43% of the first screen given to an empty input on a *monitoring*
     surface, which left exactly one clipped queue row above the fold. `null` means "follow the
     page": open while there is nothing to watch, folded once there is. The moment the user
     touches the disclosure their choice sticks. Collapsing hides nothing — the summary reads
     the spec back — and the controls stay mounted, so the spec they emit is unchanged.

     `null` is the *only* value the page may write here, and the override is driven from a real
     click on the <summary> — never from the element's `toggle` event. That is what the first
     cut of this got wrong and why the fold never once fired: `open={specExpanded}` is a
     programmatic write, Chromium fires `toggle` for programmatic writes exactly as it does for
     user ones, so an `onToggle` handler saw the mount-time open (items still `[]`) and latched
     specOpen=true before anyone had touched anything. From that instant `items.length === 0`
     was never consulted again and the block stayed open forever — the collapse shipped as pure
     cost, 41px of disclosure chrome buying nothing. A click handler cannot be spoofed by the
     render, so intent now comes only from intent. */
  const [specOpen, setSpecOpen] = useState<boolean | null>(null);
  /** Non-error feedback: duplicates skipped, items re-queued. Separate from `error` so a
   * skipped duplicate never renders in the danger tone. */
  const [notice, setNotice] = useState<string | null>(null);
  const [config, setConfig] = useState<QueueConfig>({
    concurrency: 1,
    startAt: null,
  });

  useEffect(() => {
    let cancelled = false;
    void window.sift.queue.getConfig().then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const failedCount = useMemo(
    () =>
      items.filter(
        (i) =>
          !!i.error ||
          (i.ops &&
            (["download", "transcript", "summarize"] as const).some(
              (k) => i.ops![k] === "error",
            )),
      ).length,
    [items],
  );
  const specExpanded = specOpen ?? items.length === 0;

  /* What the textarea currently holds, parsed once. Both the submit and the CTA's enabled
     state read this one expression, so "what will be added" and "can you add" cannot
     disagree — which is the whole of the bug below. */
  const pending = useMemo(
    () =>
      urls
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean),
    [urls],
  );

  const add = async () => {
    setError(null);
    setNotice(null);
    if (!spec) return;
    if (pending.length === 0) return;
    try {
      const result = await window.sift.queue.add(pending, spec);
      setUrls("");
      // A silently-dropped duplicate reads as a bug ("I pasted six, five arrived"), so say
      // what happened rather than just clearing the box.
      if (result.duplicates.length > 0) {
        const n = result.duplicates.length;
        setNotice(
          `Added ${result.added}. Skipped ${n} URL${n === 1 ? "" : "s"} already in the queue.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const retryAllFailed = async () => {
    setError(null);
    setNotice(null);
    try {
      const n = await window.sift.queue.retryFailed();
      setNotice(
        n === 0
          ? "Nothing failed."
          : `Re-queued ${n} failed item${n === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyConfig = async (next: QueueConfig) => {
    setConfig(next);
    try {
      await window.sift.queue.setConfig(next);
      setPaused(await window.sift.queue.isPaused());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const togglePause = async () => {
    if (paused) await window.sift.queue.resume();
    else await window.sift.queue.pause();
    setPaused(!paused);
  };

  return (
    // The route owns its own scroll box so the column never depends on whether the pane
    // happens to be scrolling: `scrollbar-gutter: stable` reserves the 10px track on every
    // route, which is what keeps Queue and Channels sharing one left edge and one width.
    <main
      data-testid="queue-page"
      className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
    >
      {/* One stack, one step: 32px between every top-level block on the page, set once here
          instead of a per-section margin that drifts to 16/18/22/32. Inside a block the only
          other value is 12px, from a section's own label to its content. */}
      <div className="mx-auto flex min-h-full w-full max-w-[1120px] flex-col space-y-8 px-10 pb-10 pt-7">
        {/* Header block — closed with a hairline so the eyebrow/title/subtitle read as one
            seated unit sharing the cards' left edge, not loose text on the canvas. */}
        <motion.header
          className="border-b border-border pb-5"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <p className="eyebrow">QUEUE</p>
          <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-foreground">
            Batch work, one line at a time.
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Paste a list of URLs, choose what happens to each, and let them run
            in order.
          </p>
        </motion.header>

        {/* Composer — the one rim-lit surface on this view. */}
        <section className="panel-lit px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {/* The eyebrow announces; the title is the heading. `accent-muted` is the token
                  that exists for exactly this rung — a decorative coral that clears 3:1
                  without spending the CTA hue — so it is used by name rather than re-mixed
                  as a fraction of `primary`, which would drift the moment `--primary` moves. */}
              <p className="eyebrow text-[10px] tracking-[0.16em] text-accent-muted">
                NEW BATCH
              </p>
              <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                Paste what you want processed
              </h2>
            </div>
            {/* The runner lives with the list it governs (see RunnerControls). While the queue
                is empty there is no list panel to head, so this is where it waits — and it is
                the only thing in the composer that isn't part of composing. */}
            {items.length === 0 && (
              <RunnerControls paused={paused} onToggle={togglePause} />
            )}
          </div>

          {/* resize-none: the native grip is the one bit of browser chrome that survives a dark
              restyle intact. Typed URLs stay mono (they're data); the placeholder is sans so an
              empty field doesn't introduce a second typeface for no reason.

              Three rows, not four. The field is a *paste target* — a batch arrives from the
              clipboard, it is not typed line by line — so the fourth blank row was 21px of
              guaranteed emptiness on the one route whose job is showing you a list, and it
              bought no visible line a scroll wouldn't. `min-h-[84px]` still holds the floor, so
              the box never collapses to a single-line input on a short viewport.

              Shell, fill, hairline and placeholder all come from the shared `FIELD` — the same
              string the spec row below it, the Channels URL field and every field on Settings
              use — so this route and Channels can't drift into two different objects for "the
              box you paste a link into". It also brings the placeholder onto `--placeholder`
              (5.0:1): this is the field's only instruction and at `muted-foreground/75` it
              measured 3.7:1. */}
          <textarea
            data-testid="queue-urls"
            rows={3}
            className={`mt-4 min-h-[84px] w-full resize-none rounded-xl border ${FIELD} p-3.5 font-mono text-[13px] leading-relaxed text-foreground transition-colors placeholder:font-sans focus:outline-none`}
            placeholder="One URL per line"
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
          />

          {/* Batch settings, folded to a single 32px row that reads them back. Nothing is
              hidden by folding: the summary IS the spec, and the controls stay mounted, so the
              spec the composer submits is byte-identical either way. `list-none` +
              `::-webkit-details-marker` because the UA triangle is the last browser default on
              this screen.

              `open` is the one source of truth and the click is the one input: preventing the
              summary's default keeps the DOM from toggling behind React's back, so the element
              can never hold a state the page didn't decide. Enter/Space on a focused <summary>
              dispatch a click, so the keyboard path is the same path.

              THE ROW SAYS ONE THING AT A TIME. Expanded, it is a disclosure header —
              "Batch settings" — and the four controls 40px below it are the read-out; the line
              used to restate all four of them ("VIDEO & AUDIO · BEST AVAILABLE · TRANSCRIBE
              OFF · NO TAGS") directly above the selects that already said exactly that, and at
              `foreground/70` it out-ranked the FORMAT / QUALITY / ALSO RUN / ADD TAGS labels it
              was duplicating. Folded, the controls are gone and the line is the only report of
              them, so it takes the brighter rung and the full spec.

              The two rungs are the ones globals.css already documents rather than a new
              fraction: `fg-subtle` (4.6:1) is the *head* rung — announces, then recedes, one
              step under the `muted-foreground` its own field labels sit on — and `foreground/70`
              is content. Not `foreground/45`: that composites to 4.13:1 here, the same
              under-floor value the canceled pill was moved off last round. */}
          <details
            className="mt-4 border-t border-border pt-4"
            open={specExpanded}
          >
            <summary
              onClick={(e) => {
                e.preventDefault();
                setSpecOpen(!specExpanded);
              }}
              className={`flex h-8 cursor-pointer select-none list-none items-center justify-between gap-3 rounded-lg transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden ${
                specExpanded ? "text-fg-subtle" : "text-foreground/70"
              }`}
            >
              <span className="eyebrow min-w-0 truncate text-inherit">
                {specExpanded ? "Batch settings" : specLine(spec)}
              </span>
              <ChevronDown
                aria-hidden
                className={`h-3.5 w-3.5 flex-none text-foreground/45 transition-transform duration-150 ${
                  specExpanded ? "rotate-180" : ""
                }`}
              />
            </summary>
            <div className="mt-4">
              <QueueSpecControls onChange={onSpecChange} />
            </div>
          </details>

          {/* One field, one spec row, one action. The 44px primary is byte-identical to the one
              on Channels; the runner's Pause is no longer standing beside it pretending to be
              the other half of "add a batch".

              It is also gated like the one on Channels. Over an empty textarea it sat at full
              coral saturation — the loudest object on the route — and `add()` returned early,
              so the single most prominent control on the page was a button that did nothing
              and said nothing about why. `disabled` is the primitive's one documented dead
              state (fill, hairline and ink all from tokens), and it lifts the instant the
              field holds a line. */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              data-testid="queue-add"
              className="h-11"
              onClick={add}
              disabled={pending.length === 0}
            >
              <Plus aria-hidden className="h-4 w-4" />
              Add to queue
            </Button>
            {failedCount > 0 && (
              <Button
                data-testid="queue-retry-failed"
                size="sm"
                variant="outline"
                onClick={retryAllFailed}
              >
                <RotateCw aria-hidden className="h-3.5 w-3.5" />
                Retry {failedCount} failed
              </Button>
            )}
          </div>

          {/* How the runner behaves, not what a batch contains — so it sits with the runner
              controls rather than inside the per-batch spec above. */}
          <div className="mt-4 flex flex-wrap items-end gap-5 border-t border-border pt-4">
            <label className="flex flex-col gap-1.5">
              <span className="field-label">At once</span>
              <select
                data-testid="queue-concurrency"
                aria-label="Items to run at once"
                className={`h-9 rounded-lg border ${FIELD} px-2.5 text-[13px] text-foreground`}
                value={config.concurrency}
                onChange={(e) =>
                  void applyConfig({
                    ...config,
                    concurrency: Number(e.target.value),
                  })
                }
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "1 item" : `${n} items`}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="field-label">Start at</span>
              <input
                type="time"
                data-testid="queue-start-at"
                aria-label="Scheduled start time"
                className={`h-9 rounded-lg border ${FIELD} px-2.5 text-[13px] text-foreground`}
                value={config.startAt ? toClock(config.startAt) : ""}
                onChange={(e) =>
                  void applyConfig({
                    ...config,
                    startAt: e.target.value
                      ? nextOccurrence(e.target.value)
                      : null,
                  })
                }
              />
            </label>

            {config.startAt && (
              <p
                data-testid="queue-scheduled"
                className="pb-2 text-[13px] text-muted-foreground"
              >
                Paused until {new Date(config.startAt).toLocaleString()}.{" "}
                <button
                  type="button"
                  data-testid="queue-clear-schedule"
                  onClick={() => void applyConfig({ ...config, startAt: null })}
                  className="underline decoration-foreground/35 underline-offset-[3px] hover:decoration-foreground"
                >
                  Clear
                </button>
              </p>
            )}
          </div>

          {notice && (
            <p
              data-testid="queue-notice"
              className="mt-3.5 rounded-xl border border-border bg-white/[0.03] px-4 py-3 text-sm text-muted-foreground"
            >
              {notice}
            </p>
          )}

          {error && (
            <p className="mt-3.5 rounded-xl border border-danger/25 bg-danger/12 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
        </section>

        {/* Counters, owned by a labelled block. The block takes the page's 32px step above and
            below it like every other section; inside it, the label sits 12px off its own row —
            the one nested value on the page. The label uses the shared `.eyebrow` rung rather
            than re-declaring its spec inline, which had it landing on a different grey from
            the two other labels at the identical size on the same screen.

            The strip only exists once there is something to count. An empty session was
            printing 0/0/0/0 across 145px plus a 32px step — a second, louder empty state
            stacked on top of the real one, which it pushed past the fold so the page's answer
            to "what do I do now" was the one thing you could not read. */}
        {items.length > 0 && (
          <section>
            <p className="eyebrow mb-3">This session</p>
            <div
              className={`grid grid-cols-2 gap-4 ${
                counts.canceled > 0 ? "md:grid-cols-5" : "md:grid-cols-4"
              }`}
            >
              <StatTile
                label="Queued"
                value={counts.queued}
                caption="Waiting their turn"
                icon={Clock}
                tone={STAT_TONES.queued}
              />
              <StatTile
                label="Running"
                value={counts.running}
                caption="Working right now"
                icon={Activity}
                tone={STAT_TONES.running}
              />
              <StatTile
                label="Done"
                value={counts.done}
                caption="Finished cleanly"
                icon={CircleCheck}
                tone={STAT_TONES.done}
              />
              <StatTile
                label="Attention"
                value={counts.attention}
                caption="Failed or has issues"
                icon={TriangleAlert}
                tone={STAT_TONES.attention}
              />
              {/* The fifth bucket. It only mounts when something was actually cancelled — a
                  permanent CANCELED 0 is noise — but while one exists it has to be here, or
                  the strip stops summing to the list it summarises. Neutral by tone: a
                  cancellation is a thing you did, not a thing that went wrong. */}
              {counts.canceled > 0 && (
                <StatTile
                  label="Canceled"
                  value={counts.canceled}
                  caption="Stopped by you"
                  icon={Ban}
                  tone={STAT_IDLE}
                />
              )}
            </div>
          </section>
        )}

        {items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Queue is empty"
            body="Paste one URL per line above, or send a batch from a channel page."
          />
        ) : (
          <section className="panel overflow-hidden">
            {/* The header of the list is where the list's controls belong: the count the strip
                above must agree with (same expression), then the runner that decides whether
                any of these rows move. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2/40 px-5 py-3">
              <div className="flex items-center gap-3">
                <p className="eyebrow">In queue</p>
                <span className={NEUTRAL_PILL}>
                  <span className="tabular-nums">{total}</span>
                  {total === 1 ? "item" : "items"}
                </span>
              </div>
              <RunnerControls paused={paused} onToggle={togglePause} />
            </div>

            {items.map((it, i) => {
              const tone = itemTone(it);
              const { pill, icon: ToneIcon } = TONES[tone];
              const issues = it.status === "done" ? issueLines(it) : [];
              return (
                <div
                  data-testid="queue-item"
                  key={it.id}
                  className="group flex items-start gap-4 border-b border-border px-5 py-4 transition-colors last:border-b-0 hover:bg-foreground/[0.03]"
                >
                  {/* The ordinal is the readout of the thing the two arrows change, so it
                      cannot sit at 2.6:1 while claiming to report queue position. /55 lands
                      it at ~4.6:1 — the same rung the reference panel gives its ranked
                      ordinals. */}
                  <span
                    aria-hidden
                    className="mt-1.5 w-5 flex-none font-mono text-[11px] tabular-nums text-foreground/55"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        data-testid="queue-item-status"
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase leading-5 tracking-[0.08em] ${pill}`}
                      >
                        <ToneIcon aria-hidden className="h-3 w-3" />
                        {`${statusText(it)}${
                          it.status === "running" && it.progress !== null
                            ? ` · ${it.progress}%`
                            : ""
                        }`}
                      </span>
                      <span className={NEUTRAL_PILL}>
                        {sourceHost(it.sourceUrl)}
                      </span>
                    </div>

                    {/* The row's headline is the TITLE once the item has resolved one, with
                        the URL demoted to a mono second line. Before, every row printed only
                        `displayUrl` — so a queue that had already downloaded, transcribed and
                        summarised eight talks still read as a stack of opaque IDs
                        ("/watch?v=Qr7dK2mVzXc"), and four rows carrying identical chip sets
                        were indistinguishable from each other. `title` is null until the
                        metadata fetch lands, and for anything that never downloaded, so the
                        URL keeps the headline slot whenever there is nothing better to say. */}
                    <p
                      className="mt-2 truncate text-sm font-medium text-foreground/85 transition-colors group-hover:text-foreground"
                      title={it.title ?? it.sourceUrl}
                    >
                      {it.title ?? headlineUrl(it.sourceUrl)}
                    </p>
                    {it.title && (
                      <p className="mt-0.5 truncate font-mono text-[11px] leading-4 text-fg-subtle">
                        {displayUrl(it.sourceUrl)}
                      </p>
                    )}

                    {it.spec && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {/* A spec label, not a control: it says what this item was set to, and
                            it repeats on every row. Coral on eight rows out-shouts the one
                            button on the page, so the format chip is neutral like the source
                            and tag chips beside it — the tinted pills on this row are the two
                            that carry meaning (AI violet) and the status. */}
                        <span
                          data-testid="queue-item-format"
                          className={NEUTRAL_PILL}
                        >
                          {formatLabel(it.spec.format)}
                        </span>
                        {it.spec.transcript && (
                          <span
                            className={`${PILL} border-ai/25 bg-ai/12 text-ai`}
                          >
                            <Captions aria-hidden className="h-3 w-3" />
                            Transcript
                          </span>
                        )}
                        {it.spec.summarize && (
                          <span
                            className={`${PILL} border-ai/25 bg-ai/12 text-ai`}
                            title={`${it.spec.summarize.model} · prompt #${it.spec.summarize.promptId}`}
                          >
                            <Sparkles aria-hidden className="h-3 w-3" />
                            Summary
                          </span>
                        )}
                        {it.spec.tags?.map((t) => (
                          <span
                            key={t}
                            className={NEUTRAL_PILL}
                          >{`#${t}`}</span>
                        ))}
                      </div>
                    )}

                    {it.status === "running" && (
                      <div className="mt-3 flex items-center gap-3">
                        <div
                          data-testid="queue-item-progress"
                          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/[0.08]"
                        >
                          <div
                            className={`h-full rounded-full ${INFO_BAR} ${
                              it.progress === null
                                ? "w-1/3 animate-pulse motion-reduce:animate-none"
                                : "transition-[width] duration-300 ease-out"
                            }`}
                            style={
                              it.progress === null
                                ? undefined
                                : { width: `${it.progress}%` }
                            }
                          />
                        </div>
                        <span
                          className={`w-9 flex-none text-right text-[11px] font-semibold tabular-nums ${INFO_TEXT}`}
                        >
                          {it.progress === null ? "···" : `${it.progress}%`}
                        </span>
                      </div>
                    )}

                    {issues.length > 0 && (
                      <div className="mt-3 flex flex-col gap-1.5 rounded-xl border border-warning/20 bg-warning/[0.07] px-3 py-2.5">
                        {issues.map((line, k) => (
                          <p
                            key={k}
                            data-testid="queue-item-issue"
                            className="break-words font-mono text-[11px] leading-relaxed text-warning/90"
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ONE row-action chrome, here and on Channels: 32px ghost icon buttons with
                      3.5px glyphs, gap-1, at full opacity.

                      It was three chromes in one 80px cluster — two bordered 36px boxes for the
                      arrows, a bare 36px glyph for the trash, a filled 36px slab for Cancel —
                      over a wrapper at `opacity-70`, which multiplied the arrows down to
                      2.26:1. The whole reorder mechanic, on an app whose point is ordering a
                      batch, was under the 3:1 floor for a functional control until you hovered
                      it. The primitive's own `hover:text-foreground` is the emphasis; an
                      opacity multiplier on top of it was never anything but a contrast bug. */}
                  {/* The text actions (Cancel / Retry) live in a fixed-width slot that is
                      reserved on every row, so the three icon buttons land on the same x
                      down the whole list. Inline, they pushed the icons ~100px left on
                      exactly the rows that had one, and the right edge of the list visibly
                      stepped in and out between "queued" and "done" rows. */}
                  <div className="flex flex-none items-center gap-1">
                    {/* Every row names a video and, until now, offered no way to look at it —
                        the only way to check what a rule had queued was to copy the URL out
                        of the text. */}
                    <Button
                      data-testid="queue-item-open"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Open ${it.title ?? it.sourceUrl} in the browser`}
                      title="Open in browser"
                      onClick={() => {
                        void window.sift.library.openExternal(it.sourceUrl);
                      }}
                    >
                      <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                    <div className="flex w-[74px] flex-none justify-end">
                      {(it.status === "queued" || it.status === "running") && (
                        <Button
                          data-testid="queue-item-cancel"
                          size="sm"
                          variant="ghost"
                          onClick={() => window.sift.queue.cancel(it.id)}
                        >
                          Cancel
                        </Button>
                      )}
                      {it.status === "done" && hasError(it) && (
                        <Button
                          data-testid="queue-item-retry"
                          size="sm"
                          variant="ghost"
                          onClick={() => window.sift.queue.retry(it.id)}
                        >
                          <RotateCw aria-hidden className="h-3.5 w-3.5" />
                          Retry
                        </Button>
                      )}
                    </div>
                    <Button
                      data-testid="queue-item-up"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Move up"
                      title="Move up"
                      onClick={() => window.sift.queue.reorder(it.id, "up")}
                    >
                      <ArrowUp aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      data-testid="queue-item-down"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Move down"
                      title="Move down"
                      onClick={() => window.sift.queue.reorder(it.id, "down")}
                    >
                      <ArrowDown aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      data-testid="queue-item-remove"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Remove from queue"
                      title="Remove from queue"
                      className="hover:bg-danger/12 hover:text-danger"
                      onClick={() => window.sift.queue.remove(it.id)}
                    >
                      <Trash2 aria-hidden className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
