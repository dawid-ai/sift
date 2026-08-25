import { useState } from "react";
import {
  ArrowDown,
  ExternalLink,
  Pin,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { LOCAL_PLATFORM_ID } from "@sift/core";
import type { MediaListItem, SearchHit } from "@sift/ipc-contract";
import { TagChip } from "@/components/tag-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, externalLinkUrl, videoThumbUrl } from "@/lib/utils";
import { highlightSegments } from "@/lib/search-snippet";
import { platformLabel } from "@/lib/platform-label";
import { formatDuration } from "@/routes/home/preview-card";

/** Shown next to Confirm remove for an imported file — the one thing users are nervous
 * about, and until now documented only in DEVELOPMENT.md. */
export const LOCAL_REMOVE_NOTE =
  "Removes the library entry; your file stays where it is.";

/** Whether the Channel cell can open Sift's own channel page. `channels.openForMedia`
 * resolves a channel URL out of the stored yt-dlp dump, and that page is YouTube-shaped
 * (subscriptions, outlier scores) — the same gate `media-detail.tsx` uses. */
function canOpenChannel(sourceUrl: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(sourceUrl);
}

/**
 * The Added column, zero-padded. `toLocaleDateString()` alone yields `8/16/2026` next to
 * `7/28/2026`, so the digit columns walk sideways down the table and tabular figures buy
 * nothing. Forcing 2-digit month/day keeps the user's locale order but fixes the width.
 */
function addedDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Header cell: 11px uppercase, tracked, muted — the reference's table chrome. The bottom
 * hairline is an inset shadow rather than a border because the row is `position: sticky`
 * and a collapsed-table border stops painting once the header detaches on scroll.
 *
 * `cursor-default`: none of these headers is a control (the list is ordered `created_at DESC`
 * and nothing here sorts), so no header may hint that it can be clicked.
 */
const TH =
  "sticky top-0 z-10 cursor-default whitespace-nowrap bg-surface-2 px-3 py-2.5 text-[11px] font-semibold " +
  "uppercase tracking-[0.1em] text-muted-foreground shadow-[inset_0_-1px_0_0_hsl(var(--border))]";

/**
 * The column the list is actually ordered by. It is marked *monochrome*: a brightened label
 * plus a stronger hairline under the cell, and nothing else. `--primary` is reserved for the
 * brand mark, the active nav item and the primary CTA — this screen carries none of the three,
 * so a full-strength coral column label was the most saturated mark in the window, spent on a
 * `th` that is `cursor-default` and does not sort. Accent + caret + underline is the universal
 * vocabulary of a sort *control*; wearing it here made the header lie about being one.
 *
 * The rule is drawn on the header cell itself (`after`, inset to the cell's own padding) so it
 * can never be wider or narrower than the column it belongs to. `sticky` already makes the cell
 * a containing block — adding `relative` here would override it and unstick the header on scroll.
 */
const TH_SORTED =
  "text-fg-secondary after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-border-strong";

/**
 * Body cell rhythm. **`align-middle`, and every cell is one line.**
 *
 * It was `align-top` with 10px of padding, because the Video cell reserved a second line under
 * the title for its tag chips: the row stood two lines tall whether or not it carried tags,
 * every other cell was one line pinned to the top half, and the bottom 14px of the whole right
 * two-thirds was dead surface. That put the pitch at 71px, so a 567px scroll region showed 8 of
 * 24 results — three scrolls to read one page — and the view that exists *because* it is denser
 * than the tiles scanned no faster than they do.
 *
 * The chips ride the title's own line now (see the Video cell), which leaves one 20px line box
 * per cell and lets every cell centre against the same axis. Row content is a single number —
 * 28px, shared by the poster, the row's two controls and the 20px pills' line box — so the
 * pitch is 45px and ~13 rows fit the viewport that used to hold 8.
 */
const TD = "px-3 py-2 align-middle";

/** The one-line rhythm every cell in the row shares, the title included. */
const TD_LINE = "text-[12.5px] leading-5";

/** The mid-dot between two values in one cell — a separator, not a value. */
const SEPARATOR = "text-muted-foreground";

/**
 * The "no value" mark. **Not a glyph.**
 *
 * Colour alone cannot carry an em dash: it is a 1px horizontal hairline, its stroke lands
 * between the pixel grid at 12.5px, and it renders as two partial rows — sampled on screen,
 * RGB(86,82,79) over RGB(121,117,113) — so it paints at roughly 60% of whatever token it is
 * given. `muted-foreground` is 6.2:1 as a *fill* and the dash still came back at 3.7:1 in
 * Assets and 3.6:1 in Transcript: half of two columns read as unpainted cells while the
 * `1 summary` sitting beside them rendered at 6.2:1, one column drawing two value types a full
 * rung apart. Re-tokening it cannot fix that, because the loss is in the rasteriser, not the
 * colour — which is why this is the third time the dash has been found sitting under its rung.
 *
 * A 2px opaque block hits `muted-foreground` exactly (#A19B97 on #1F1C1A, 6.2:1), so an empty
 * cell speaks in the same voice as the data beside it and reads as a deliberate mark rather
 * than as a paint failure. The em dash survives only inside a longer run of text, where the
 * letterforms around it carry it.
 *
 * `role="img"` + a label, because a mark a sighted reader can see is a mark a screen reader
 * has to be told about; a bare decorative span would leave the cell silent.
 */
function NoValue() {
  return (
    <span
      role="img"
      aria-label="none"
      className="inline-block h-[2px] w-3 rounded-full bg-muted-foreground align-middle"
    />
  );
}

/**
 * The library's chip family — one shape, three meanings.
 *
 * `PILL` is the shared geometry, so every chip on a row is the same 20px pill whatever it
 * says. Which chips are allowed a *hue* is the discipline:
 *
 * - platform  → **neutral**. Coral used to mark the source, which meant YouTube and Vimeo
 *   shipped the same warm fill: colour was being paid for in noise and returned nothing,
 *   because you had to read the wordmark anyway. The wordmark does the work now, and the
 *   accent is freed up for things that are actually a state.
 * - language  → `ai` violet, per spec §3 (transcript/language is the AI hue).
 * - format    → outline only. Quality is a qualifier, not a category; it recedes.
 * - count     → soft white-alpha. Numbers, not classes.
 *
 * Hue still means state where state exists — a Badge `variant` (success / warning / danger)
 * outranks all of them, so "coloured differently" keeps reading as "something happened".
 */
export const PILL =
  "h-5 gap-1 rounded-full border px-2 py-0 text-[11px] font-medium leading-none tracking-[0.02em]";
export const CHIP_PLATFORM = `${PILL} border-foreground/14 bg-foreground/[0.06] text-muted-foreground`;
/**
 * The language chip. Fill and border are `--ai` — the AI hue, per spec §3 — but the *label* is
 * a lighter rung of that same violet, and has to be: `text-ai` is #8A7AFF, and this pill's own
 * fill (`ai/12` over the row ground) resolves to #2C2836, which puts an 11px label at 4.31:1.
 * It is the only coloured data token in the table, so it is also the one label most likely to
 * be read for its colour rather than its shape. #C4B5FD is the same violet two steps lighter
 * and measures 7.6:1 on that fill. The border stays where it is — a non-text mark clears its
 * floor at 3.7:1.
 *
 * The literal is deliberate and not novel: `globals.css` carries one violet rung (`--ai`),
 * tuned for a mark on the page ground rather than for text inside its own tint, and `badge.tsx`
 * already lifts the coral the same way for its `accent` tone (`text-[hsl(18_100%_73%)]`). If a
 * lighter `--ai` rung is ever added, this is the call site to fold back into it.
 */
export const CHIP_LANG = `${PILL} border-ai/30 bg-ai/12 text-[#C4B5FD]`;
export const CHIP_FORMAT = `${PILL} border-border-strong bg-transparent text-muted-foreground`;
export const CHIP_COUNT = `${PILL} border-foreground/12 bg-foreground/[0.06] text-foreground/75`;
/** Retained name for the neutral treatment (counts / anything unclassified). */
export const PILL_META = CHIP_COUNT;

/** Icon-only destructive action. Same shell and height as the neutral action beside it —
 * a bare glyph reads as *less* affordance than the benign button it sits next to. */
export const ICON_ACTION =
  "h-8 w-8 border border-border bg-transparent text-muted-foreground " +
  "hover:border-danger/30 hover:bg-danger/12 hover:text-danger";

export interface LibraryTableProps {
  items: MediaListItem[];
  onOpen: (id: number) => void;
  onRemove: (id: number) => void;
  onTagClick: (name: string) => void;
  /** Right-click a tag: toggles it as a negative filter (hide everything carrying it). */
  onTagExclude?: (name: string) => void;
  /** Jump to a video's source channel. Omitted → the Channel cell is plain text. */
  onOpenChannel?: (mediaId: number) => void;
  hits?: Map<number, SearchHit> | null;
  query?: string;
  /** Selection for bulk actions. Omitted → no checkbox column at all. */
  selected?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onToggleSelectAll?: () => void;
  /** Favourite + pin toggles. Omitted → the flag column is not rendered. */
  onToggleFavourite?: (id: number, next: boolean) => void;
  onTogglePinned?: (id: number, next: boolean) => void;
}

/** Table-first library view: one row per media item, with format/transcript/summary counts
 * at a glance instead of requiring a detail-page visit. */
export function LibraryTable({
  items,
  onOpen,
  onRemove,
  onTagClick,
  onTagExclude,
  onOpenChannel,
  hits,
  query,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onToggleFavourite,
  onTogglePinned,
}: LibraryTableProps) {
  const selectable = !!selected && !!onToggleSelect;
  const allSelected =
    selectable &&
    items.length > 0 &&
    items.every((i) => selected.has(i.media.id));
  return (
    // min-w keeps eight columns from crushing in a narrow window — the panel's scroller
    // takes the overflow instead of the cells.
    // `shrink-0` because the panel's scroller is a flex column: without it the table is a
    // shrinkable flex item and long pages could be squeezed instead of scrolling.
    <table
      data-testid="library-table"
      className="w-full min-w-[58rem] shrink-0 border-collapse text-[13px]"
    >
      <thead>
        <tr>
          {selectable && (
            <th className={cn(TH, "w-8 pl-4 text-left")}>
              <input
                type="checkbox"
                data-testid="library-select-all"
                aria-label="Select every row on this page"
                className="h-3.5 w-3.5 accent-primary"
                checked={allSelected}
                onChange={() => onToggleSelectAll?.()}
              />
            </th>
          )}
          <th className={cn(TH, "pl-4 text-left")}>Video</th>
          <th className={cn(TH, "text-left")}>Channel</th>
          <th className={cn(TH, "text-right")}>Length</th>
          <th className={cn(TH, "text-left")}>Platform</th>
          <th className={cn(TH, "text-left")}>Transcript</th>
          {/* One column, not two. Formats and Summaries used to be separate headers and between
              them held ~190px — the widest slot in the table — to render one `720p` and three
              `1`s across eight rows; everything else in them was a dash. The Video cell, the
              only column that identifies a row, was clipping mid-word to pay for it. Folded
              together the same information costs ~110px and the rest goes to the title.

              Left-aligned, like Platform and Transcript beside it: the two centred columns were
              a third alignment rule sitting between the left-aligned pills and the right-aligned
              numerals, so four adjacent columns ran on three different axes. */}
          <th className={cn(TH, "text-left")}>Files</th>
          {/* The list really is ordered created_at DESC, so the column it is ordered by says so
              — but quietly, and in monochrome (see TH_SORTED). The arrow is a static direction
              marker at the same 12px as the rest of the header chrome, not a caret: nothing in
              this table sorts, so no header may wear a control's clothes. */}
          <th
            aria-sort="descending"
            title="Sorted: newest first"
            className={cn(TH, TH_SORTED, "text-right")}
          >
            <span className="inline-flex items-center gap-1">
              Added
              <ArrowDown aria-hidden className="h-3 w-3 text-fg-subtle" />
            </span>
          </th>
          <th className={cn(TH, "pr-4 text-right")}>Actions</th>
        </tr>
      </thead>
      {/* The last row's hairline would double up against the pagination strip's top border. */}
      <tbody className="[&>tr:last-child]:border-b-0">
        {items.map((item) => (
          <LibraryRow
            key={item.media.id}
            item={item}
            onOpen={onOpen}
            onRemove={onRemove}
            onTagClick={onTagClick}
            onTagExclude={onTagExclude}
            onOpenChannel={onOpenChannel}
            hit={hits?.get(item.media.id)}
            query={query}
            checked={selectable ? selected.has(item.media.id) : undefined}
            onToggleSelect={selectable ? onToggleSelect : undefined}
            onToggleFavourite={onToggleFavourite}
            onTogglePinned={onTogglePinned}
          />
        ))}
      </tbody>
    </table>
  );
}

interface LibraryRowProps {
  item: MediaListItem;
  checked?: boolean;
  onToggleSelect?: (id: number) => void;
  onToggleFavourite?: (id: number, next: boolean) => void;
  onTogglePinned?: (id: number, next: boolean) => void;
  onOpen: (id: number) => void;
  onRemove: (id: number) => void;
  onTagClick: (name: string) => void;
  /** Right-click a tag: toggles it as a negative filter (hide everything carrying it). */
  onTagExclude?: (name: string) => void;
  onOpenChannel?: (mediaId: number) => void;
  hit?: SearchHit | undefined;
  query?: string | undefined;
}

/** A single row, with its own inline-confirm state for Remove (mirrors MediaCard). */
function LibraryRow({
  item,
  checked,
  onToggleSelect,
  onToggleFavourite,
  onTogglePinned,
  onOpen,
  onRemove,
  onTagClick,
  onTagExclude,
  onOpenChannel,
  hit,
  query,
}: LibraryRowProps) {
  const [confirming, setConfirming] = useState(false);
  const {
    media,
    transcriptCount,
    transcriptLanguage,
    formats,
    summaryCount,
    tags,
  } = item;
  // Left accent + faint tint rather than a strong background: rows already carry a hover
  // tint and heavier fill would fight the tag chips on the title line.
  const local = media.platformId === LOCAL_PLATFORM_ID;
  // First glyph of the title, so an un-thumbnailed poster carries something specific to *this*
  // row rather than the same film icon eight times. Mirrors MediaCard's monogram.
  const monogram = (media.title.trim()[0] ?? "•").toUpperCase();
  // Two chips ride the title's line; the rest collapse into one counter. The cap is what makes
  // the inline tags safe: a heavily tagged row can never take the title's width, and the column
  // is sized by a run whose length is bounded (title + two chips) rather than by the tag count.
  const shownTags = tags.slice(0, 2);
  const hiddenTags = tags.slice(2);
  // YouTube opens Sift's own channel page; everything else goes to the uploader's page on
  // the source platform (an X profile, a Vimeo user) in the default browser, since the
  // in-app Channels view has nothing to show for them.
  const inAppChannel =
    !!onOpenChannel && !!media.uploader && canOpenChannel(media.sourceUrl);
  const sourceChannelUrl = media.uploader
    ? externalLinkUrl(media.uploaderUrl)
    : null;
  // One shell for all three states of this cell (in-app link / external link / plain text), so
  // the column's text and its reserved glyph slot line up whatever the row can actually do.
  const channelCell =
    "flex max-w-[13rem] items-center gap-1 text-left leading-5 text-muted-foreground";
  const channelLink =
    `${channelCell} underline-offset-4 transition-colors duration-150 ` +
    "hover:text-foreground hover:[&>span:first-child]:underline";

  return (
    <tr
      data-testid="library-row"
      data-local={local ? "true" : undefined}
      className={cn(
        "group border-b border-border/70 transition-colors duration-150",
        local
          ? "border-l-2 border-l-primary/70 bg-primary/[0.045] hover:bg-primary/[0.08]"
          : "hover:bg-foreground/[0.03]",
      )}
    >
      {onToggleSelect && (
        <td className={cn(TD, "pl-4")}>
          <input
            type="checkbox"
            data-testid="library-row-select"
            aria-label={`Select ${media.title}`}
            className="h-3.5 w-3.5 accent-primary"
            checked={checked ?? false}
            onChange={() => onToggleSelect(media.id)}
          />
        </td>
      )}
      <td className={cn(TD, "pl-4")}>
        {/* `items-center`: the cell is one 28px band and the title is a 20px line box inside it,
            so the line has to be centred against the poster or it sits 4px above every other
            cell in the row — the whole point of the middle-aligned rhythm.

            `gap-2.5`, down from 12px with the poster: the gap between a mark and its label is
            read against the mark, and 10px beside a 50px poster is the ratio 12px had beside an
            82px one. The 2px goes back to the title. */}
        <div className="flex items-center gap-2.5">
          {/* The fallback sits under the image, so a thumbnail that 404s (onError hides it)
              reveals a *designed* placeholder — a lit bevel, not a black hole: a 145° warm ramp,
              a soft pool of light, an inset rim and a 1px top highlight.

              The mark is the title's first letter, the same treatment the tile poster uses,
              scaled down. A shared film glyph at `white/15` was ~1.8:1 on this fill, so eight of
              these read as eight holes down the leading edge while spending 82px a row on the
              least information per pixel; a monogram is legible *and* specific to the row.

              50×28, not 82×46: the poster is the tallest thing in a table row, so it — not the
              padding — sets the pitch, and at 46px it alone made a 45px row impossible. It is
              cut to the height the row's controls already are, which is what leaves the whole
              row one 28px band. The 32px it gives back go to the title beside it, so the
              inline tag chips are paid for out of the poster rather than out of the only cell
              that identifies the row. Tiles are where a poster is the point; this is the dense
              view, and here it is an identifier. */}
          <div
            className={cn(
              "relative h-7 w-[50px] shrink-0 overflow-hidden rounded-md",
              "bg-[linear-gradient(145deg,hsl(20_14%_11%),hsl(20_10%_7%))]",
              "shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.06)] ring-1 ring-inset ring-white/[0.06]",
            )}
          >
            <span
              aria-hidden
              className="absolute inset-0 bg-[radial-gradient(62%_62%_at_50%_44%,hsl(var(--foreground)/0.06),transparent_72%)]"
            />
            <span
              aria-hidden
              className="absolute inset-0 grid place-items-center text-[11px] font-semibold leading-none tracking-tight text-fg-subtle/70"
            >
              {monogram}
            </span>
            {media.thumbnailUrl && (
              <img
                src={videoThumbUrl(media.thumbnailUrl)}
                alt={media.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            {/* The poster opens Details, same as the title beside it. A transparent overlay
                button keeps the focus ring, the keyboard activation and the accessible name
                without turning the whole row into a control — the row already carries tag
                chips, a channel link and its own buttons. */}
            <button
              type="button"
              data-testid="media-open-poster"
              onClick={() => onOpen(media.id)}
              aria-label={`Open ${media.title}`}
              className="absolute inset-0 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/70"
            />
          </div>
          {/* Capped so one long title can't take the whole auto-layout table hostage — but at
              34rem, not 28rem: the ~85px reclaimed by folding Formats and Summaries into one
              Assets column belongs here, on the only cell that identifies the row. A real title
              ("What every programmer should know about memory") lands inside the cap instead of
              clipping mid-word, and still does with two chips beside it — the auto layout sizes
              this column from the title-plus-chips run, and takes the difference out of the
              slack sitting in Platform and Transcript. Same value as the search snippet below
              it, so the two blocks terminate on one right edge. */}
          <div className="min-w-0 max-w-[34rem]">
            {/* Title and tags on ONE line. The tags used to sit on a reserved second line under
                the title, which is what made every row two lines tall and the table's pitch
                71px — a 26px slot held open on every row for chips most rows do not have. Beside
                the title they cost nothing vertically, and the row reads the way the reference's
                table row does: the name, then the pill that qualifies it, then the columns.

                `min-w-0` on the title and `shrink-0` on the chips: when the cell is tight the
                title ellipsises and the chips stay whole, because a clipped pill reads as a
                rendering fault where a clipped title reads as a long title. */}
            <div className="flex min-w-0 items-center gap-2">
              {/* Tier 1 of the row: the only line at full weight. `leading-5` is the shared line
                  box — every cell in the row uses the same one (TD_LINE), which is what puts
                  them all on one axis. */}
              <button
                type="button"
                data-testid="media-open-title"
                onClick={() => onOpen(media.id)}
                className="line-clamp-1 min-w-0 rounded-sm text-left text-[13px] font-medium leading-5 text-foreground/90 underline-offset-4 transition-colors duration-150 hover:underline group-hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                {media.title}
              </button>
              {tags.length > 0 && (
                <span className="flex shrink-0 items-center gap-1">
                  {shownTags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="rounded transition-opacity duration-150 hover:opacity-80"
                      onClick={() => onTagClick(t)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        onTagExclude?.(t);
                      }}
                      title={`Click to filter by "${t}", right-click to hide it`}
                    >
                      <TagChip name={t} />
                    </button>
                  ))}
                  {/* The overflow counter, as the same 20px pill it counts — the reference's
                      `+1`. It is deliberately not a control: the tags it stands for are on the
                      detail page and in the filter bar above, and a chip that filters by an
                      unnamed set would be a click with no readable consequence. `title` names
                      them. */}
                  {hiddenTags.length > 0 && (
                    <Badge
                      variant="neutral"
                      className={CHIP_COUNT}
                      title={hiddenTags.join(", ")}
                    >
                      +{hiddenTags.length}
                    </Badge>
                  )}
                </span>
              )}
            </div>
            {hit &&
              (hit.field === "transcript" || hit.field === "summary") &&
              hit.snippet && (
                <div
                  data-testid="search-snippet"
                  className="mt-1 max-w-[34rem] text-xs leading-relaxed text-muted-foreground"
                >
                  <span className="mr-1.5 rounded border border-border bg-surface-2 px-1 py-px text-[9px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                    {hit.field}
                  </span>
                  {highlightSegments(hit.snippet, query ?? "").map((s, i) =>
                    s.match ? (
                      <mark
                        key={i}
                        className="rounded-[3px] bg-primary/25 px-0.5 text-foreground"
                      >
                        {s.text}
                      </mark>
                    ) : (
                      <span key={i}>{s.text}</span>
                    ),
                  )}
                </div>
              )}
          </div>
        </div>
      </td>
      <td className={cn(TD, TD_LINE)}>
        {/* The external-link glyph gets a reserved 16px slot on *every* row, so the channel
            column terminates on one axis instead of going ragged wherever a channel happens
            to have no external page. It also stays out of the way until the row is hovered —
            it is an affordance, not a second thing to read on every line. */}
        {inAppChannel ? (
          <button
            type="button"
            data-testid="library-row-channel"
            onClick={() => onOpenChannel!(media.id)}
            title={`Open ${media.uploader} in Sift`}
            className={channelLink}
          >
            <span className="truncate">{media.uploader}</span>
            <span aria-hidden className="inline-flex w-4 shrink-0" />
          </button>
        ) : sourceChannelUrl ? (
          <button
            type="button"
            data-testid="library-row-channel"
            data-external="true"
            onClick={() =>
              void window.sift.library.openExternal(sourceChannelUrl)
            }
            title={`Open ${sourceChannelUrl} in your browser`}
            className={channelLink}
          >
            <span className="truncate">{media.uploader}</span>
            <span
              aria-hidden
              className="inline-flex w-4 shrink-0 justify-center"
            >
              <ExternalLink className="h-3 w-3 opacity-0 transition-opacity duration-150 group-hover:opacity-60" />
            </span>
          </button>
        ) : (
          <span data-testid="library-row-channel" className={channelCell}>
            {media.uploader ? (
              <span className="truncate">{media.uploader}</span>
            ) : (
              <NoValue />
            )}
            <span aria-hidden className="inline-flex w-4 shrink-0" />
          </span>
        )}
      </td>
      <td
        data-testid="library-row-duration"
        className={cn(
          TD,
          TD_LINE,
          "text-right font-mono tabular-nums text-muted-foreground",
        )}
      >
        {formatDuration(media.durationSec)}
      </td>
      <td className={cn(TD, TD_LINE)}>
        {/* Neutral: the wordmark identifies the source. Only the language keeps a hue here
            (violet, the AI channel) and quality stays a bare outline — see the chip family. */}
        <Badge
          data-testid="library-row-platform"
          variant="neutral"
          className={CHIP_PLATFORM}
        >
          {platformLabel(media.platformId)}
        </Badge>
      </td>
      <td className={cn(TD, TD_LINE)}>
        {transcriptCount > 0 && transcriptLanguage ? (
          <Badge variant="ai" className={CHIP_LANG}>
            {transcriptLanguage.toUpperCase()}
          </Badge>
        ) : (
          // A drawn rule at the Channel rung (6.2:1), never a dash — see NoValue.
          <NoValue />
        )}
      </td>
      {/* Assets — what this row actually holds, as one line: `720p · 1 sum`. The format keeps
          the outline chip (and the danger tone when a download failed, which is a real state and
          must not be flattened into text); the summary count is a plain tabular run, because a
          number is not a class. One `NoValue` rule when the row has neither, so the cell never
          sits empty and never needs two marks to say one thing. */}
      <td className={cn(TD, TD_LINE)}>
        {formats.length > 0 || summaryCount > 0 ? (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            {formats.map((f) => (
              <Badge
                key={f.id}
                variant={f.status === "error" ? "danger" : "neutral"}
                className={f.status === "error" ? PILL : CHIP_FORMAT}
              >
                {f.label}
              </Badge>
            ))}
            {formats.length > 0 && summaryCount > 0 && (
              // The reference's quiet mid-dot: a separator, not a third value.
              <span aria-hidden className={SEPARATOR}>
                ·
              </span>
            )}
            {/* The word does not fit and the abbreviation was worse than not saying it.
                Spelling out "1 summary" costs this column ~25px it does not have (the table
                has ~11px of slack over its columns' max-content widths, and the title cell
                would pay), but "1 sum" reads as a clipped word rather than as a unit — a
                truncation artefact repeated down every row that has a summary. The sparkle
                is the same glyph the Summarize action and the tile's summary chip already
                use for this exact field, so the count needs no unit at all. `title` still
                spells it for the reader who wants the word. */}
            {summaryCount > 0 && (
              <span
                className="inline-flex items-center gap-1 tabular-nums text-muted-foreground"
                title={`${summaryCount} ${summaryCount === 1 ? "summary" : "summaries"}`}
              >
                <Sparkles aria-hidden className="h-3 w-3 text-ai/80" />
                {summaryCount}
              </span>
            )}
          </span>
        ) : (
          <NoValue />
        )}
      </td>
      {/* Right-aligned and zero-padded, so 08/16/2026 and 07/28/2026 stack digit over digit
          instead of drifting with the width of a one-digit month. */}
      <td
        className={cn(
          TD,
          TD_LINE,
          "whitespace-nowrap text-right tabular-nums text-muted-foreground",
        )}
      >
        {addedDate(media.createdAt)}
      </td>
      {/* No padding correction any more: the cell is `align-middle` and the controls are the
          same 28px as the poster at the other end of the row, so the whole row is one band and
          the buttons centre in it on their own. */}
      <td className={cn(TD, "pr-4")}>
        <div className="flex items-center justify-end gap-1.5">
          {/* Icon toggles rather than buttons with words: they are per-row state, not actions
              on the row, and eight rows of "Favourite"/"Pin" would out-shout Details. */}
          {onToggleFavourite && (
            <button
              type="button"
              data-testid="media-favourite"
              aria-label={
                item.favourite
                  ? `Remove ${media.title} from favourites`
                  : `Add ${media.title} to favourites`
              }
              aria-pressed={item.favourite}
              className={cn(
                "rounded-md p-1 transition-colors",
                item.favourite
                  ? "text-primary"
                  : "text-foreground/30 hover:text-foreground/70",
              )}
              onClick={() => onToggleFavourite(media.id, !item.favourite)}
            >
              <Star
                aria-hidden
                className={cn("h-3.5 w-3.5", item.favourite && "fill-current")}
              />
            </button>
          )}
          {onTogglePinned && (
            <button
              type="button"
              data-testid="media-pin"
              aria-label={
                item.pinnedAt === null
                  ? `Pin ${media.title} to the top`
                  : `Unpin ${media.title}`
              }
              aria-pressed={item.pinnedAt !== null}
              className={cn(
                "rounded-md p-1 transition-colors",
                item.pinnedAt !== null
                  ? "text-primary"
                  : "text-foreground/30 hover:text-foreground/70",
              )}
              onClick={() => onTogglePinned(media.id, item.pinnedAt === null)}
            >
              <Pin
                aria-hidden
                className={cn(
                  "h-3.5 w-3.5",
                  item.pinnedAt !== null && "fill-current",
                )}
              />
            </button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5"
            data-testid="media-open"
            onClick={() => onOpen(media.id)}
          >
            Details
          </Button>
          {confirming ? (
            <>
              {local && (
                <span className="max-w-[15rem] text-right text-[11px] leading-snug text-muted-foreground">
                  {LOCAL_REMOVE_NOTE}
                </span>
              )}
              <Button
                size="sm"
                variant="danger"
                className="h-7 px-2.5"
                data-testid="media-remove-confirm"
                onClick={() => onRemove(media.id)}
                title={local ? LOCAL_REMOVE_NOTE : undefined}
              >
                Confirm remove
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2.5"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            // Icon-only: the label is carried by aria-label/title, so screen readers and
            // hover still say "Remove". The confirm step keeps its text — a destructive
            // confirmation shouldn't be a second unlabelled glyph. Same bordered shell and
            // height as Details, so the destructive action isn't the lower-affordance one.
            <Button
              size="icon-sm"
              variant="ghost"
              data-testid="media-remove"
              aria-label="Remove"
              title="Remove"
              // 28px here, 32px on the tile: the shell is shared, the density is not — this
              // control sets the table's row pitch and the card's does not set anything.
              className={cn(ICON_ACTION, "h-7 w-7")}
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
