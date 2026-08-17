import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
  LayoutGrid,
  ListMusic,
  Rows3,
  Search,
  SearchX,
  Tag,
} from "lucide-react";
import { LOCAL_TAG } from "@sift/core";
import type {
  LibraryFacets,
  MediaFilter,
  MediaListItem,
  PlaylistExportResult,
  SearchHit,
} from "@sift/ipc-contract";
import { TagChip } from "@/components/tag-chip";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getLibraryView,
  setLibraryView,
  getPageSize,
  setPageSize,
  PAGE_SIZE_OPTIONS,
  type LibraryView,
} from "@/lib/library-view";
import { pageWindow } from "@/lib/page-window";
import { platformLabel } from "@/lib/platform-label";
import { LibraryTable } from "@/routes/library/library-table";
import { MediaCard } from "@/routes/library/media-card";
import { MediaDetailPage } from "@/routes/library/media-detail";

/**
 * Page header — the route's identity strip (eyebrow → title), rendered on the populated list
 * and on the first-run empty state alike so the Library never opens as a bare sentence
 * floating in the canvas. `meta` rides on the right of the title, on the same bottom edge.
 *
 * It used to be a 28px title over a two-line subtitle with three stat cards beside it, and
 * between them they cost ~130px of a 900px window before a single row appeared. The subtitle
 * said what the search placeholder already says; two of the three stat numbers restated the
 * footer's "Showing 1–24 of 29" and the tag filter directly below. On a view whose entire job
 * is scanning a list, that is the wrong place to spend the height.
 */
function LibraryHeader({ meta }: { meta?: ReactNode }) {
  return (
    // The hairline is the alignment: the title and the counts are different sizes, so they are
    // given a shared bottom edge to sit on rather than left to end wherever they stop.
    <header className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-x-8 gap-y-2 border-b border-border/60 pb-3">
      <div className="min-w-[18rem]">
        {/* The eyebrow is the route's brand mark. The lit dot in front of it keeps it from
            dissolving into the warm page tint — coral text on a coral-tinted ground is only
            a hue apart, so the accent needs a shape as well as a colour. */}
        <p className="eyebrow flex items-center gap-2">
          <span
            aria-hidden
            className="h-1 w-1 rounded-full bg-primary shadow-[0_0_10px_1px_hsl(var(--primary)/0.7)]"
          />
          Library
        </p>
        <h1 className="mt-1.5 text-[22px] font-bold leading-[1.2] tracking-[-0.02em] text-foreground">
          Everything you&rsquo;ve saved.
        </h1>
      </div>
      {meta}
    </header>
  );
}

/**
 * One count in the header's metadata line. The numeral keeps the emphasis the stat cards had
 * — full-strength, tabular — but a count now costs a word instead of a 120px panel.
 */
function HeaderStat({ value, label }: { value: number; label: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="font-semibold tabular-nums text-foreground">
        {value}
      </span>{" "}
      {label}
    </span>
  );
}

/** The separator between header counts — the reference's quiet mid-dot, not a pipe. */
function MetaDot() {
  return (
    <span aria-hidden className="text-fg-disabled">
      ·
    </span>
  );
}

/**
 * The list's floor. The row rhythm carries on as 4%-opacity hairlines under the last row and
 * a warm bloom sits on the bottom edge, so the part of the panel the results don't reach is
 * still a designed surface instead of a hole. It collapses to nothing the moment the rows
 * fill the panel (flex-basis 0 + `overflow-hidden`), and the end marker only appears on the
 * last page, where "nothing else" is actually true.
 */
function ListRest({ atEnd, pitch }: { atEnd: boolean; pitch: number }) {
  return (
    <div aria-hidden className="relative min-h-0 flex-1 overflow-hidden">
      {/* The pitch is passed in, not baked: these hairlines only work as "the rows carry on
          past here" if they land exactly where the next rows would have, and the table's row
          is 45px while a tile is not a row at all. Inline style because the value is dynamic —
          Tailwind's arbitrary values are compiled from the source text and cannot take one. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, hsl(var(--foreground) / 0.04) 0px, " +
            `hsl(var(--foreground) / 0.04) 1px, transparent 1px, transparent ${pitch}px)`,
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(58%_62%_at_50%_118%,hsl(var(--primary)/0.07),transparent_68%)]" />
      {atEnd && (
        <div className="absolute inset-x-10 top-1/2 flex -translate-y-1/2 items-center gap-4">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border-strong" />
          <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
            Nothing else yet
          </span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border-strong" />
        </div>
      )}
    </div>
  );
}

/**
 * Dashed slots that finish the last row of the tile grid — the reference's language for an
 * empty slot, and the reason one card in a four-wide grid no longer sits as an orphan beside
 * 900px of nothing. Decorative only.
 *
 * The grid's column count is a breakpoint, not a measurement, so each ghost's visibility is
 * resolved per breakpoint from the item count: ghost *i* shows at *c* columns exactly when
 * *c* needs more than *i* slots to complete its last row.
 */
const GRID_STEPS = [
  { cols: 2, on: "sm:block", off: "sm:hidden" },
  { cols: 3, on: "xl:block", off: "xl:hidden" },
  { cols: 4, on: "2xl:block", off: "2xl:hidden" },
];

function gridGhosts(count: number): string[] {
  const needed = (cols: number) => (cols - (count % cols)) % cols;
  const most = Math.max(0, ...GRID_STEPS.map((s) => needed(s.cols)));
  return Array.from({ length: most }, (_, i) =>
    // Base is one column, which never needs a filler.
    [
      "hidden",
      ...GRID_STEPS.map((s) => (needed(s.cols) > i ? s.on : s.off)),
    ].join(" "),
  );
}

/** One segment of the Table/Tiles control. Active reads like the nav rail: tinted lift,
 * coral icon, full-strength label. */
function ViewSegment({
  active,
  icon,
  label,
  testId,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium",
        "transition-colors duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        active
          ? "bg-surface text-foreground shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.07)] ring-1 ring-inset ring-border-strong/70 [&_svg]:text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span aria-hidden className="[&_svg]:h-3.5 [&_svg]:w-3.5">
        {icon}
      </span>
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ date range ----- */

/** `yyyy-mm-dd` for a *local* date. `toISOString()` would shift a day across the UTC line. */
function isoDay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Parses the `yyyy-mm-dd` a `type="date"` field holds into local midnight (or null). */
function parseDay(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const dayLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const monthLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/** Precise-entry fields inside the range popover. Chromium's own date widget is the only
 * control in the app that would otherwise paint in the UA font with a stock picker glyph:
 * `color-scheme: dark` hands it the dark palette, the family is forced back to Inter, and
 * the indicator is inverted so it reads on a dark surface. */
const POPOVER_DATE_FIELD = [
  "h-9 w-full rounded-lg border border-border bg-surface-2/70 px-2.5",
  "text-[13px] text-foreground [color-scheme:dark] [font-family:inherit] [letter-spacing:0]",
  "transition-colors duration-150 ease-out hover:border-border-strong",
  "focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15",
  "[&::-webkit-calendar-picker-indicator]:cursor-pointer",
  "[&::-webkit-calendar-picker-indicator]:opacity-45",
  "[&::-webkit-calendar-picker-indicator]:invert",
  "hover:[&::-webkit-calendar-picker-indicator]:opacity-90",
  "[&::-webkit-datetime-edit]:leading-none",
  "[&::-webkit-datetime-edit-fields-wrapper]:p-0",
].join(" ");

/**
 * The "Added" filter. The trigger is an ordinary control that matches the search field and
 * the channel select — same height, same radius, same fill — and reads its own state
 * ("Added: Any date" / "Added: Aug 1 – Aug 16") instead of putting a caps label inside the
 * field. The month grid does the picking; the two `type="date"` fields stay, mounted in the
 * popover for exact entry, keeping their testids and accessible names.
 *
 * Presentation only: it owns nothing but which month is on screen and whether the popover
 * is open — the range itself is still the page's `from`/`to` state, set through the same
 * two setters the bare inputs used.
 */
function DateRangeFilter({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() =>
    startOfMonth(parseDay(from) || new Date()),
  );

  const start = parseDay(from);
  const end = parseDay(to);
  const set = !!(from || to);
  const label =
    start && end
      ? `${dayLabel(start)} – ${dayLabel(end)}`
      : start
        ? `From ${dayLabel(start)}`
        : end
          ? `Until ${dayLabel(end)}`
          : "Any date";

  // First click sets the start and clears the end; the next click closes the range. Clicking
  // before the current start restarts rather than producing an inverted range.
  function pickDay(d: Date) {
    if (!start || end || d < start) {
      onFrom(isoDay(d));
      onTo("");
    } else {
      onTo(isoDay(d));
    }
  }

  const lead = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const length = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from(
      { length },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
    ),
  ];
  const today = isoDay(new Date());
  const isEdge = (d: Date) => isoDay(d) === from || isoDay(d) === to;
  const isWithin = (d: Date) => !!start && !!end && d > start && d < end;

  return (
    <div
      className="relative shrink-0"
      // Mirrors FilterSelect: focus-out and Escape close it, no outside-click listener.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        data-testid="library-date-range"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          // 36px and `shadow-bevel`, matching FilterSelect exactly — this trigger sits between
          // two of them and must not read as a different species of control.
          "flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-[13px] shadow-bevel",
          "transition-colors duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          set
            ? "border-primary/30 bg-primary/14 text-primary"
            : "border-border bg-surface-2/80 text-muted-foreground hover:border-border-strong hover:text-foreground",
        )}
      >
        <CalendarRange aria-hidden className="h-4 w-4 shrink-0 opacity-70" />
        <span>
          Added: <span className={cn(!set && "text-fg-subtle")}>{label}</span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Added date range"
          className="absolute right-0 z-20 mt-1.5 w-[19rem] rounded-2xl border border-border bg-surface p-3 shadow-pop"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
              }
              className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <ChevronLeft aria-hidden className="h-4 w-4" />
            </button>
            <p className="text-[13px] font-medium text-foreground">
              {monthLabel(month)}
            </p>
            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
              }
              className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <ChevronRight aria-hidden className="h-4 w-4" />
            </button>
          </div>

          <div aria-hidden className="grid grid-cols-7 gap-0.5 pb-1">
            {WEEKDAY_INITIALS.map((d, i) => (
              <span
                key={`${d}-${i}`}
                className="grid h-6 place-items-center text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-subtle"
              >
                {d}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) =>
              d === null ? (
                <span key={`pad-${i}`} aria-hidden className="h-8" />
              ) : (
                <button
                  key={isoDay(d)}
                  type="button"
                  onClick={() => pickDay(d)}
                  className={cn(
                    "h-8 rounded-lg text-[12px] tabular-nums transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                    isEdge(d)
                      ? "bg-gradient-to-br from-primary to-primary-lit font-semibold text-primary-foreground"
                      : isWithin(d)
                        ? "bg-primary/12 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
                    !isEdge(d) &&
                      isoDay(d) === today &&
                      "ring-1 ring-inset ring-border-strong",
                  )}
                >
                  {d.getDate()}
                </button>
              ),
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                From
              </span>
              <input
                data-testid="library-date-from"
                type="date"
                value={from}
                onChange={(e) => onFrom(e.target.value)}
                className={POPOVER_DATE_FIELD}
                aria-label="From date"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                To
              </span>
              <input
                data-testid="library-date-to"
                type="date"
                value={to}
                onChange={(e) => onTo(e.target.value)}
                className={POPOVER_DATE_FIELD}
                aria-label="To date"
              />
            </label>
          </div>

          <div className="mt-2.5 flex items-center justify-between">
            <button
              type="button"
              disabled={!set}
              onClick={() => {
                onFrom("");
                onTo("");
              }}
              className="rounded text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline disabled:opacity-40 disabled:hover:text-muted-foreground disabled:hover:no-underline"
            >
              Clear
            </button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-[12px]"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A film grain, ~3% over the route. It is not decoration: a wide low-contrast radial over a
 * near-black ground steps visibly in 8-bit colour, and dithering it with noise is the only
 * cheap fix. Inline `style` rather than an arbitrary utility because the payload is a data
 * URI full of characters Tailwind's class parser would have to escape; `img-src … data:` in
 * the renderer CSP already covers it.
 */
const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * The route's own light: a warm wash that continues the canvas' low-left ember (whose own
 * terminus is what leaves a visible step in the corner) and a faint coral answer in the
 * opposite corner, then the grain over both. Painted before the content, which is
 * positioned, so it stays behind.
 */
function PageAtmosphere() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(92% 60% at 4% 102%, hsl(18 52% 10% / 0.6), transparent 66%)",
            "radial-gradient(68% 52% at 92% 104%, hsl(var(--primary) / 0.05), transparent 70%)",
          ].join(", "),
        }}
      />
      <div
        aria-hidden
        style={{ backgroundImage: GRAIN_URL }}
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
      />
    </>
  );
}

/** Empty-state block: dashed outline + a muted glyph chip, per the reference's empty slots. */
function EmptyBlock({
  icon,
  headline,
  children,
}: {
  icon: ReactNode;
  headline: string;
  children: ReactNode;
}) {
  return (
    <div className="flex max-w-md flex-col items-center gap-2.5 rounded-2xl border border-dashed border-border px-10 py-12 text-center">
      <span
        aria-hidden
        className="mb-1 grid h-12 w-12 place-items-center rounded-full border border-border bg-surface-2 text-fg-subtle [&_svg]:h-5 [&_svg]:w-5"
      >
        {icon}
      </span>
      <p className="text-[15px] font-semibold text-foreground">{headline}</p>
      {children}
    </div>
  );
}

export interface LibraryPageProps {
  onOpenChannel?: (mediaId: number) => void;
  /** When set (e.g. from a channel's downloaded list), open this media's detail on mount. */
  focusMediaId?: number | null;
  onFocusMediaHandled?: () => void;
  /** Increments when the Library nav is clicked — closes any open detail, back to the list. */
  homeSignal?: number;
}

export function LibraryPage({
  onOpenChannel,
  focusMediaId,
  onFocusMediaHandled,
  homeSignal,
}: LibraryPageProps) {
  const [items, setItems] = useState<MediaListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(getPageSize());
  const [jump, setJump] = useState(""); // jump-to-page input value
  const [facets, setFacets] = useState<LibraryFacets>({
    channels: [],
    platforms: [],
    tags: [],
  });
  const [selectedId, setSelectedId] = useState<number | null>(
    focusMediaId ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<LibraryView>(getLibraryView());
  // Tag filters. Positive tags AND together (each click narrows); right-clicking a tag
  // instead hides everything carrying it. A tag is in at most one of the two lists.
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [excludedTags, setExcludedTags] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [searchHits, setSearchHits] = useState<Map<number, SearchHit> | null>(
    null,
  );
  const [channel, setChannel] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [from, setFrom] = useState<string>(""); // yyyy-mm-dd
  const [to, setTo] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0); // bump to force a refetch after a mutation
  const [exportResult, setExportResult] = useState<PlaylistExportResult | null>(
    null,
  );
  const [exportError, setExportError] = useState<string | null>(null);
  // Presentation only: the tag filter is clipped to one row until asked to open. A 20-chip
  // filter that wraps to two rows was costing ~90px of a view whose job is showing rows.
  const [tagsOpen, setTagsOpen] = useState(false);
  const tagBarRef = useRef<HTMLDivElement>(null);
  const [tagsHidden, setTagsHidden] = useState(0);

  // The active filter, sent to the DB. Search contributes its matched ids (null = no search).
  const filter: MediaFilter = {
    tags: activeTags,
    excludeTags: excludedTags,
    channel,
    platform,
    from: from ? Date.parse(`${from}T00:00:00`) : null,
    to: to ? Date.parse(`${to}T23:59:59.999`) : null,
    ids: searchHits ? [...searchHits.keys()] : null,
  };

  const anyFilter = !!(
    activeTags.length ||
    excludedTags.length ||
    channel ||
    platform ||
    from ||
    to ||
    searchHits
  );
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // The local-file tag sorts first: it marks a whole class of media, not one topic among
  // many. Done here rather than in SQL so `listAllTags` stays generically alphabetical —
  // and `sort` is stable, so everything else keeps that order.
  const isLocalTag = (name: string) => name.toLowerCase() === LOCAL_TAG;
  const filterTags = [...facets.tags].sort(
    (a, b) => Number(isLocalTag(b.name)) - Number(isLocalTag(a.name)),
  );

  const has = (list: string[], name: string) =>
    list.some((t) => t.toLowerCase() === name.toLowerCase());
  const without = (list: string[], name: string) =>
    list.filter((t) => t.toLowerCase() !== name.toLowerCase());
  const toggle = (list: string[], name: string) =>
    has(list, name) ? without(list, name) : [...list, name];

  /** Left-click: require the tag (AND with the others). Also drops it from the excluded set. */
  function toggleActive(name: string) {
    setActiveTags((prev) => toggle(prev, name));
    setExcludedTags((prev) => without(prev, name));
  }

  /** Right-click: hide everything carrying the tag. A tag is never required and excluded at once. */
  function toggleExcluded(name: string) {
    setExcludedTags((prev) => toggle(prev, name));
    setActiveTags((prev) => without(prev, name));
  }

  function refresh() {
    setReloadKey((k) => k + 1);
  }

  function changePageSize(n: number) {
    setPageSizeState(n);
    setPageSize(n);
    setPage(0); // keep the first row of the current view in sight
  }

  function changeView(v: LibraryView) {
    setView(v);
    setLibraryView(v);
  }

  // How many chips the one-row clip is actually hiding, measured rather than guessed: chip
  // widths vary, so "+8 more" can only come from where the browser wrapped them. Clipping is
  // `overflow-hidden`, not `display:none`, so every chip still reports a real `offsetTop` and
  // anything below the first row's is off-screen. Purely a label — nothing here filters.
  useEffect(() => {
    const el = tagBarRef.current;
    if (!el) return;
    const measure = () => {
      const kids = Array.from(el.children) as HTMLElement[];
      const first = kids[0]?.offsetTop ?? 0;
      setTagsHidden(kids.filter((k) => k.offsetTop > first).length);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // The observer covers width changes; the deps cover the chip set changing under a clamped
    // height, which the observer cannot see. Neither value is read in the body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facets.tags, activeTags, excludedTags]);

  // Facets span the whole library, so they only change when rows are added/removed —
  // refetch on mount and after any mutation (reloadKey), not on every filter change.
  useEffect(() => {
    void window.sift.library
      .facets()
      .then(setFacets)
      .catch((e) => setError(String(e)));
  }, [reloadKey]);

  // Consumed the cross-route focus (selectedId was seeded from it) — clear it in the parent so
  // returning to Library later doesn't re-open the same detail.
  useEffect(() => {
    if (focusMediaId != null) onFocusMediaHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Library nav clicked — close any open detail. Guarded so the initial mount (homeSignal 0/undefined)
  // doesn't clobber a focusMediaId-seeded detail.
  useEffect(() => {
    if (homeSignal) setSelectedId(null);
  }, [homeSignal]);

  // Debounced DB search: empty query clears hits without an IPC round-trip.
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setSearchHits(null);
      return;
    }
    const t = setTimeout(() => {
      void window.sift.library.search(q).then((hits) => {
        setSearchHits(new Map(hits.map((h) => [h.mediaId, h])));
      });
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter/search change returns to the first page.
  useEffect(() => {
    setPage(0);
  }, [activeTags, excludedTags, channel, platform, from, to, searchHits]);

  // A filtered value can vanish (its last video removed/retagged) while the filter still
  // references it — clear it so the view isn't stranded on an empty result with no visible reset.
  useEffect(() => {
    const live = new Set(facets.tags.map((t) => t.name.toLowerCase()));
    const prune = (prev: string[]) =>
      prev.every((t) => live.has(t.toLowerCase()))
        ? prev
        : prev.filter((t) => live.has(t.toLowerCase()));
    setActiveTags(prune);
    setExcludedTags(prune);
  }, [facets.tags]);
  useEffect(() => {
    if (channel && !facets.channels.includes(channel)) setChannel(null);
  }, [facets.channels, channel]);
  useEffect(() => {
    if (platform && !facets.platforms.includes(platform)) setPlatform(null);
  }, [facets.platforms, platform]);

  // Removing the last row on a page can push `page` past the end — clamp back into range.
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [pageCount, page]);

  // Fetch the current page whenever the filter, page, or a mutation changes it.
  useEffect(() => {
    void window.sift.library
      .listPage(filter, page, pageSize)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e) => setError(String(e)));
    // filter is rebuilt each render; depend on its primitive parts instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTags,
    excludedTags,
    channel,
    platform,
    from,
    to,
    searchHits,
    page,
    pageSize,
    reloadKey,
  ]);

  if (selectedId != null) {
    return (
      <MediaDetailPage
        key={selectedId}
        id={selectedId}
        onBack={() => {
          // Refresh so edits made in the detail view (tags, transcripts,
          // summaries, downloads) reflect in the list, not just on remove.
          setSelectedId(null);
          refresh();
        }}
        onRemoved={() => {
          setSelectedId(null);
          refresh();
        }}
        onOpenChannel={onOpenChannel}
      />
    );
  }

  // Nothing in the library at all (no filter active) — the first-run empty state.
  if (total === 0 && !anyFilter) {
    return (
      <main className="relative flex min-h-0 flex-1 flex-col p-8">
        <PageAtmosphere />
        <div className="relative mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col">
          <LibraryHeader />
          {/* Same surface treatment as the populated list panel — near-opaque fill, rim light,
              top-edge highlight — so the two states of this route read as one place. */}
          <div
            className={cn(
              "panel-lit flex flex-1 items-center justify-center bg-surface/[0.94] p-8",
              "shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.05),0_0_34px_-8px_hsl(18_95%_55%/0.16),0_26px_60px_-34px_hsl(0_0%_0%/0.9)]",
            )}
          >
            <EmptyBlock icon={<Inbox />} headline="Your library is empty.">
              <p
                data-testid="library-empty"
                className="text-sm text-muted-foreground"
              >
                No downloads yet — paste a URL on the Home tab to add your first
                video.
              </p>
            </EmptyBlock>
          </div>
        </div>
      </main>
    );
  }

  function handleOpen(id: number) {
    setSelectedId(id);
  }

  function handleJump(e: FormEvent) {
    e.preventDefault();
    const n = Number(jump);
    if (Number.isInteger(n) && n >= 1 && n <= pageCount) setPage(n - 1);
    setJump("");
  }

  function handleRemove(id: number) {
    void window.sift.library
      .remove(id)
      .then(() => refresh())
      .catch((e) => setError(String(e)));
  }

  async function handleExportM3U() {
    setExportError(null);
    try {
      // Export the whole filtered set, not just the visible page.
      const ids = await window.sift.library.listIds(filter);
      const name = activeTags.join("-") || channel || "sift-library";
      setExportResult(await window.sift.library.exportPlaylist(ids, name));
    } catch (e) {
      setExportError(String(e));
    }
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col p-8">
      <PageAtmosphere />
      <div className="relative mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col">
        <LibraryHeader
          meta={
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-muted-foreground">
              <HeaderStat
                value={total}
                label={anyFilter ? "in view" : "entries"}
              />
              <MetaDot />
              <HeaderStat value={facets.channels.length} label="channels" />
              <MetaDot />
              <HeaderStat value={facets.tags.length} label="tags" />
            </p>
          }
        />

        {error && (
          <p
            data-testid="library-remove-error"
            className="mb-3 rounded-xl border border-danger/25 bg-danger/12 px-3.5 py-2.5 text-sm text-danger"
          >
            {error}
          </p>
        )}

        {/* ONE panel for the whole library: toolbar band → results → pagination strip, inside
            a single rim-lit border. Previously the toggle row and the filter row floated on
            the raw canvas above a bordered card, which asserted a surface hierarchy nothing
            justified. Now every band is a nested surface of the same panel.

            `flex-1` is the other half of that: the panel runs to the bottom gutter whether or
            not the rows reach it, so the list has a floor instead of stopping a third of the
            way down an undesigned page. The inner scroller takes the overflow. */}
        <div
          className={cn(
            "panel-lit flex min-h-0 flex-1 flex-col bg-surface/[0.94]",
            "shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.05),0_0_34px_-8px_hsl(18_95%_55%/0.16),0_26px_60px_-34px_hsl(0_0%_0%/0.9)]",
          )}
        >
          {/* Toolbar band — one surface, welded to the top of the panel. Every control on it is
              36px, so the segmented view toggle, the search field, the three filters and Export
              sit on one optical line and the band costs one row of height instead of two.

              `pr-[26px]` = the 16px the rest of the panel uses plus the 10px scrollbar gutter
              the results region below reserves (`::-webkit-scrollbar { width: 10px }` in
              globals.css). Without it this band — and the tag row that shares its padding —
              ran 10px past everything beneath it: the table's Remove button and the tile
              grid's last column sit inside that gutter, and the pager's ghost buttons carry
              their own 10px of optical padding, so all four bands now stop on one axis and
              the only strip that does not scroll is no longer the one overhanging the panel. */}
          <div className="shrink-0 space-y-2.5 rounded-t-2xl border-b border-border bg-surface-2/50 py-3 pl-4 pr-[26px]">
            <div className="flex flex-wrap items-center gap-2">
              {/* The view toggle is one segmented track, so Table/Tiles read as two states of
                  a single control instead of two loose buttons. */}
              <div className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border bg-background/40 p-0.5">
                <ViewSegment
                  active={view === "table"}
                  icon={<Rows3 />}
                  label="Table"
                  testId="library-view-table"
                  onClick={() => changeView("table")}
                />
                <ViewSegment
                  active={view === "tiles"}
                  icon={<LayoutGrid />}
                  label="Tiles"
                  testId="library-view-tiles"
                  onClick={() => changeView("tiles")}
                />
              </div>
              <div className="relative min-w-[15rem] flex-1">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
                />
                <Input
                  data-testid="library-search-input"
                  type="search"
                  placeholder="Search title, transcript, summary…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-11 text-[13px]"
                />
              </div>
              <FilterSelect
                testId="library-channel-filter"
                allLabel="All channels"
                value={channel}
                onChange={setChannel}
                className="shrink-0"
                options={facets.channels.map((c) => ({ value: c, label: c }))}
              />
              {facets.platforms.length > 1 && (
                <FilterSelect
                  testId="library-platform-filter"
                  allLabel="All platforms"
                  value={platform}
                  onChange={setPlatform}
                  className="shrink-0"
                  options={facets.platforms.map((p) => ({
                    value: p,
                    label: platformLabel(p),
                  }))}
                />
              )}
              {/* One trigger, same shell as its two neighbours — the range is written out in
                  the label instead of a caps tag sitting inside the field. */}
              <DateRangeFilter
                from={from}
                to={to}
                onFrom={setFrom}
                onTo={setTo}
              />
              {/* Export is not a fourth filter. It wears the same 36px outline shell as the
                  three dropdowns and sat at the same 8px gap after them, so it read as one more
                  thing that narrows the view — but filters change what you see and this one
                  writes a file. A hairline is the cheapest way to say "different group" without
                  giving the command a different shell. */}
              <span
                aria-hidden
                className="mx-1 h-6 w-px shrink-0 self-center bg-border/60"
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                data-testid="export-m3u"
                disabled={total === 0}
                onClick={handleExportM3U}
              >
                <ListMusic aria-hidden className="h-4 w-4" />
                Export M3U
              </Button>
            </div>

            {facets.tags.length > 0 && (
              <div className="flex items-start gap-x-3 gap-y-2 border-t border-border/60 pt-2.5">
                <span className="mt-1.5 inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                  <Tag aria-hidden className="h-3 w-3" />
                  Tags
                </span>
                {/* Clipped to a single chip row until opened. `-my-1 py-1` is the ring room an
                    active chip needs (ring + offset paint 4px outside the pill), so selecting a
                    tag doesn't shave the top off its own focus ring. */}
                <div
                  ref={tagBarRef}
                  data-testid="tag-filter-bar"
                  className={cn(
                    "-my-1 flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-1",
                    !tagsOpen && "max-h-[34px] overflow-hidden",
                  )}
                >
                  {filterTags.map((t) => {
                    const excluded = has(excludedTags, t.name);
                    const active = has(activeTags, t.name);
                    return (
                      <button
                        key={t.name}
                        type="button"
                        data-testid="tag-filter"
                        data-tag-excluded={excluded ? "true" : undefined}
                        aria-pressed={active}
                        title={
                          excluded
                            ? `Hiding "${t.name}" — right-click to stop hiding`
                            : `Click to require "${t.name}" (stacks with other tags), right-click to hide it`
                        }
                        onClick={() => toggleActive(t.name)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          toggleExcluded(t.name);
                        }}
                        className={cn(
                          "relative rounded transition-opacity duration-150",
                          active
                            ? "ring-2 ring-primary/70 ring-offset-2 ring-offset-background"
                            : "hover:opacity-80",
                          excluded && "opacity-45",
                        )}
                      >
                        <TagChip name={t.name} />
                        {excluded && (
                          <span
                            aria-hidden
                            className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-danger text-[10px] font-bold leading-none text-background"
                          >
                            −
                          </span>
                        )}
                        {excluded && (
                          <span className="sr-only"> (excluded)</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Clear and the disclosure live *outside* the clipped bar: they must stay
                    reachable on the collapsed row, and keeping them out of it leaves the bar
                    holding nothing but chips, which is what makes the "+N more" count exact. */}
                <div className="flex shrink-0 items-center gap-3 pt-[5px]">
                  {(activeTags.length > 0 || excludedTags.length > 0) && (
                    <button
                      type="button"
                      data-testid="tag-filter-clear"
                      className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
                      onClick={() => {
                        setActiveTags([]);
                        setExcludedTags([]);
                      }}
                    >
                      Clear
                    </button>
                  )}
                  {(tagsHidden > 0 || tagsOpen) && (
                    <button
                      type="button"
                      aria-expanded={tagsOpen}
                      onClick={() => setTagsOpen((v) => !v)}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      {tagsOpen ? "Fewer" : `+${tagsHidden} more`}
                      <ChevronDown
                        aria-hidden
                        className={cn(
                          "h-3 w-3 transition-transform duration-150",
                          tagsOpen && "rotate-180",
                        )}
                      />
                    </button>
                  )}
                </div>
              </div>
            )}

            {exportError && (
              <p
                data-testid="playlist-export-error"
                className="rounded-xl border border-danger/25 bg-danger/12 px-3.5 py-2.5 text-sm text-danger"
              >
                {exportError}
              </p>
            )}
            {exportResult && (
              <p
                data-testid="playlist-export-result"
                className="flex flex-wrap items-center gap-2 rounded-xl border border-success/25 bg-success/12 px-3.5 py-2.5 text-sm text-success"
              >
                Exported {exportResult.included} video
                {exportResult.included === 1 ? "" : "s"}
                {exportResult.skipped > 0
                  ? ` (${exportResult.skipped} skipped)`
                  : ""}
                <button
                  type="button"
                  className="font-semibold underline underline-offset-4 hover:no-underline"
                  onClick={() =>
                    void window.sift.library.reveal(exportResult.path)
                  }
                >
                  Open
                </button>
              </p>
            )}
          </div>

          {/* The results fade into the pagination strip instead of being guillotined by it —
              the tile grid used to end dead flush against the footer with cards sliced mid-
              content, which reads as a broken layout rather than as a scroll region.

              The mask lives on this *non-scrolling* wrapper rather than on the scroller: a
              masked overflow box is the one case where the fade's position is arguable, and a
              wrapper whose box is exactly the visible area is not. Static gradient, no filter
              and no blur — the perf note in globals.css rules those out on a long list. */}
          <div
            className="flex min-h-0 flex-1 flex-col"
            style={{
              WebkitMaskImage:
                "linear-gradient(to bottom, #000 calc(100% - 28px), transparent)",
              maskImage:
                "linear-gradient(to bottom, #000 calc(100% - 28px), transparent)",
            }}
          >
            {/* `scrollbar-gutter: stable` is the other half of the toolbar's `pr-[26px]`: the
                gutter is reserved whether or not this page of results happens to overflow, so
                the right edge of the rows is on one axis with the toolbar above them at 24
                per page and at 4. Without it the content column jumps 10px sideways the moment
                a page stops scrolling. */}
            <div
              data-testid="library-scroll"
              className="flex min-h-0 flex-1 flex-col overflow-auto [scrollbar-gutter:stable] bg-[radial-gradient(130%_86%_at_100%_100%,hsl(var(--primary)/0.045),transparent_62%)]"
            >
              {total === 0 ? (
                <div
                  data-testid="library-no-matches"
                  className="flex min-h-[18rem] flex-1 items-center justify-center p-8"
                >
                  <EmptyBlock icon={<SearchX />} headline="No matches">
                    <p className="text-sm text-muted-foreground">
                      Nothing here fits the current search, tags or date range.
                      Widen the range or clear a filter to bring rows back.
                    </p>
                  </EmptyBlock>
                </div>
              ) : view === "table" ? (
                <>
                  <LibraryTable
                    items={items}
                    onOpen={handleOpen}
                    onRemove={handleRemove}
                    onTagClick={toggleActive}
                    onTagExclude={toggleExcluded}
                    onOpenChannel={onOpenChannel}
                    hits={searchHits}
                    query={search.trim()}
                  />
                  {/* 45px = the table's row pitch (`py-2` + one 28px band + the hairline). */}
                  <ListRest atEnd={page >= pageCount - 1} pitch={45} />
                </>
              ) : (
                <>
                  <div
                    data-testid="library-grid"
                    // `pb-6`: a card must never touch the pagination strip. The grid used to end
                    // flush against it, which read as a broken layout rather than a scroll region.
                    className="grid shrink-0 grid-cols-1 gap-4 px-4 pb-6 pt-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                  >
                    {items.map((item) => (
                      <MediaCard
                        key={item.media.id}
                        item={item}
                        onOpen={handleOpen}
                        onRemove={handleRemove}
                        onTagClick={toggleActive}
                        onTagExclude={toggleExcluded}
                        hit={searchHits?.get(item.media.id)}
                        query={search.trim()}
                      />
                    ))}
                    {/* Dashed slots finish the last row so a short page is a complete grid
                        rather than one card marooned beside a column of nothing. */}
                    {gridGhosts(items.length).map((visibility, i) => (
                      <div
                        key={`slot-${i}`}
                        aria-hidden
                        className={cn(
                          "rounded-2xl border border-dashed border-border/70 bg-foreground/[0.012]",
                          visibility,
                        )}
                      />
                    ))}
                  </div>
                  {/* No row pitch to continue under a grid — this is a quiet rhythm on an
                      unfilled surface, so it keeps the wider spacing. */}
                  <ListRest atEnd={page >= pageCount - 1} pitch={70} />
                </>
              )}
            </div>
          </div>
          {total > 0 && (
            // The strip sits *over* the scroll region's fade, so it is opaque enough to read
            // against and carries the same lit top edge the panels do.
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-border bg-surface-2/80 px-4 py-2.5 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.05)]">
              {/* `items-baseline`: the select's label used to sit below "Showing 1–24 of 29"
                  beside it. Now both sit on one baseline. */}
              <div className="flex items-baseline gap-3 text-[12.5px] text-muted-foreground">
                <p data-testid="library-result-count" className="tabular-nums">
                  Showing {page * pageSize + 1}–
                  {Math.min(total, (page + 1) * pageSize)} of {total}
                </p>
                {/* 32px, matching the pager buttons it shares this strip with — not the 36px
                    filters in the toolbar band two surfaces above. This control was previously
                    matched to that toolbar, which left it standing 4px proud of every button
                    beside it; a footer under a 12.5px caption is an h-8 density, and the strip
                    now resolves to exactly one control height. `appearance-none` plus the lucide
                    chevron keeps it off the UA widget; `color-scheme` keeps the option list dark. */}
                <label className="relative flex items-baseline">
                  <span className="sr-only">Per page</span>
                  <select
                    data-testid="library-page-size"
                    value={pageSize}
                    onChange={(e) => changePageSize(Number(e.target.value))}
                    className={cn(
                      "h-8 appearance-none rounded-lg border border-border bg-surface-2/80 pl-2.5 pr-7",
                      "text-[12.5px] tabular-nums text-muted-foreground shadow-bevel [color-scheme:dark]",
                      "transition-colors duration-150 ease-out hover:border-border-strong hover:text-foreground",
                      "focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15",
                    )}
                    aria-label="Results per page"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}/page
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden
                    className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground opacity-60"
                  />
                </label>
              </div>
              {pageCount > 1 && (
                <div
                  data-testid="library-pager"
                  className="flex flex-wrap items-center justify-end gap-1"
                >
                  {/* Labels stay as text — they are these buttons' accessible names, and the
                      chevrons are decorative. */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 px-2.5"
                    data-testid="library-page-first"
                    disabled={page === 0}
                    onClick={() => setPage(0)}
                  >
                    <ChevronsLeft aria-hidden className="h-3.5 w-3.5" />
                    First
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 px-2.5"
                    data-testid="library-page-prev"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft aria-hidden className="h-3.5 w-3.5" />
                    Prev
                  </Button>
                  {pageWindow(page + 1, pageCount).map((tok, i) =>
                    tok === "…" ? (
                      <span
                        key={`gap-${i}`}
                        className="px-1 text-fg-disabled"
                        aria-hidden
                      >
                        …
                      </span>
                    ) : (
                      // The current page is a *selected state*, not the loudest thing on the
                      // page. A solid coral fill on a paginator made a page number outshout
                      // every real action in the table — the strongest colour in the view
                      // spent on where you already are. It now reads as a lifted, ringed
                      // chip, and this surface ships with no solid accent at all.
                      <Button
                        key={tok}
                        size="sm"
                        variant="ghost"
                        className={cn(
                          "h-8 min-w-[2rem] px-2 tabular-nums",
                          tok - 1 === page &&
                            "bg-foreground/[0.08] font-semibold text-foreground ring-1 ring-inset ring-border-strong hover:bg-foreground/[0.10]",
                        )}
                        data-testid={`library-page-${tok}`}
                        aria-current={tok - 1 === page ? "page" : undefined}
                        aria-label={`Page ${tok}`}
                        onClick={() => setPage(tok - 1)}
                      >
                        {tok}
                      </Button>
                    ),
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 px-2.5"
                    data-testid="library-page-next"
                    disabled={page >= pageCount - 1}
                    onClick={() =>
                      setPage((p) => Math.min(pageCount - 1, p + 1))
                    }
                  >
                    Next
                    <ChevronRight aria-hidden className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 px-2.5"
                    data-testid="library-page-last"
                    disabled={page >= pageCount - 1}
                    onClick={() => setPage(pageCount - 1)}
                  >
                    Last
                    <ChevronsRight aria-hidden className="h-3.5 w-3.5" />
                  </Button>
                  {pageCount > 5 && (
                    <form
                      onSubmit={handleJump}
                      className="ml-2 flex items-center gap-1.5"
                    >
                      <label
                        htmlFor="library-jump"
                        className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                      >
                        Go to
                      </label>
                      <input
                        id="library-jump"
                        data-testid="library-page-jump"
                        type="number"
                        min={1}
                        max={pageCount}
                        value={jump}
                        onChange={(e) => setJump(e.target.value)}
                        placeholder={String(page + 1)}
                        className={cn(
                          "h-8 w-14 rounded-lg border border-border bg-surface-2/70 px-2 text-center",
                          "text-[12px] tabular-nums text-foreground placeholder:text-placeholder",
                          "transition-colors duration-150 ease-out hover:border-border-strong",
                          "focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15",
                        )}
                        aria-label={`Jump to page (1–${pageCount})`}
                      />
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
