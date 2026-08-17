import { useState, type ReactNode } from "react";
import {
  Clapperboard,
  Facebook,
  FolderOpen,
  Globe,
  HardDrive,
  Instagram,
  Music,
  Trash2,
  Twitch,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import { LOCAL_PLATFORM_ID } from "@sift/core";
import type { MediaListItem, MediaRecord, SearchHit } from "@sift/ipc-contract";
import { TagChip } from "@/components/tag-chip";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { cn, videoThumbUrl } from "@/lib/utils";
import { highlightSegments } from "@/lib/search-snippet";
import { platformLabel } from "@/lib/platform-label";
import {
  ICON_ACTION,
  LOCAL_REMOVE_NOTE,
  PILL,
} from "@/routes/library/library-table";
import { formatDuration } from "@/routes/home/preview-card";

const STATUS_LABELS: Record<MediaRecord["downloadStatus"], string> = {
  none: "Not downloaded",
  downloading: "Downloading",
  done: "Done",
  error: "Error",
};

/**
 * Status is the one thing on a tile allowed a semantic hue (spec §2: status only) — but every
 * state must still draw the *same box*.
 *
 * `none` is `outline`, not `neutral`: `neutral`'s fill is `bg-foreground/[0.08]`, which the
 * poster call site then overrides with its own solid backing, so nothing was left to draw a
 * border and "Not downloaded" rendered as bare near-white text in a slot where "Done" rendered
 * as a bordered pill. On a page where most tiles are un-downloaded, that made the least
 * significant state the loudest mark on the poster — brighter than the card title beneath it.
 */
const STATUS_VARIANTS: Record<
  MediaRecord["downloadStatus"],
  NonNullable<BadgeProps["variant"]>
> = {
  none: "outline",
  downloading: "warning",
  done: "success",
  error: "danger",
};

/**
 * A monochrome mark for the source, rendered at 14px in front of the channel name. It replaces
 * the tinted platform pill: a chip costs a whole line of chip vocabulary and a hue to say what
 * a glyph plus the uploader's name already says. The label is never lost — it rides along as
 * `title` and as screen-reader text.
 *
 * **No mark here may be lucide `Video`.** That glyph is the app's own identity mark, painted in
 * coral in the rail by `app-shell.tsx`; using it for Vimeo put the same camera shape on screen
 * once as "this app" and twice as "this came from Vimeo", 12px apart in one viewport.
 */
const PLATFORM_ICONS: Record<string, LucideIcon> = {
  youtube: Youtube,
  vimeo: Clapperboard,
  twitch: Twitch,
  instagram: Instagram,
  facebook: Facebook,
  soundcloud: Music,
  [LOCAL_PLATFORM_ID]: HardDrive,
};
const platformIcon = (id: string): LucideIcon =>
  PLATFORM_ICONS[id.toLowerCase()] ?? Globe;

/** Splits a path for display: everything up to and including the last separator, then the
 * filename. Handles both separators — imported files carry whatever the OS gave us. */
function splitAt(path: string): number {
  return Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/")) + 1;
}
const dirOf = (path: string) => path.slice(0, splitAt(path));
const fileOf = (path: string) => path.slice(splitAt(path));

/**
 * The name of the folder the file sits in — nothing else. Truncating a full Windows path inside
 * a 200px chip left `C…`, a bare drive letter, which identifies nothing; keeping the path's
 * separators and leading ellipsis then had the same failure at tile width, where the whole
 * directory collapsed to a lone `…` glyph. `title` still carries the path verbatim, and so does
 * the OS when Open is clicked, so this line only has to answer "which folder".
 */
function lastFolder(path: string): string {
  const parts = dirOf(path).split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * The filename as a person would read it. `filename.ts` joins channel and title with `__`,
 * which is a join token for the filesystem's benefit, not a thing to show anyone.
 */
const prettyFile = (path: string) => fileOf(path).replace(/_{2,}/g, " — ");

/** Both sides of a channel-vs-filename comparison, reduced to what survives
 * `sanitizeFilename`: it collapses whitespace and swaps every reserved char for `_`, so
 * dropping whitespace, underscores and that reserved set from *both* strings is what lets the
 * channel "Fireship: Live" still match the "Fireship_ Live" that ended up in the path. */
const nameKey = (s: string) => s.toLowerCase().replace(/[\s_<>:"/\\|?*]+/g, "");

/**
 * The filename with the channel taken off the front.
 *
 * `buildOutputBaseName` writes every download as `<uploader>__<title>`, and this card already
 * prints the uploader two lines above with its platform mark. Spending the one filename line
 * on a second copy of it — which is exactly what survived when the line was clipped from the
 * tail — told the reader nothing they weren't already looking at.
 *
 * The prefix is only dropped when it really is *this* entry's uploader. An imported file is
 * the user's own name for it and may legitimately open with a dashed clause of its own, so an
 * unrecognised leading segment is kept verbatim — as is a title that merely happens to contain
 * a dash. `title` on the row still carries the full path either way.
 */
function fileLabel(path: string, uploader: string | null): string {
  const pretty = prettyFile(path);
  if (!uploader) return pretty;
  const [head, ...rest] = pretty.split(" — ");
  if (rest.length > 0 && nameKey(head ?? "") === nameKey(uploader))
    return rest.join(" — ");
  return pretty;
}

/**
 * Splits a filename into a head that may be clipped and a tail that may not, so the ellipsis
 * lands in the *middle*: `Fixture Video Ti…tle.mp4`.
 *
 * Plain `truncate` clips the end, which throws away the two things that identify a file — how
 * the name finishes and what type it is — and keeps the beginning, which is the least specific
 * part of it. The tail here is the extension plus the three characters in front of it; when
 * the row is wide enough for the whole name the two spans sit flush and there is no seam.
 */
function splitForMiddleClip(label: string): [string, string] {
  const dot = label.lastIndexOf(".");
  const keep = dot > 0 && label.length - dot <= 6 ? label.length - dot + 3 : 4;
  const cut = Math.max(0, label.length - keep);
  return [label.slice(0, cut), label.slice(cut)];
}

export interface MediaCardProps {
  item: MediaListItem;
  onOpen: (id: number) => void;
  onRemove: (id: number) => void;
  onTagClick: (name: string) => void;
  /** Right-click a tag: toggles it as a negative filter (hide everything carrying it). */
  onTagExclude?: (name: string) => void;
  hit?: SearchHit | undefined;
  query?: string | undefined;
}

/** Presentational card for a single library entry: open detail + inline-confirm remove. */
export function MediaCard({
  item,
  onOpen,
  onRemove,
  onTagClick,
  onTagExclude,
  hit,
  query,
}: MediaCardProps) {
  const [confirming, setConfirming] = useState(false);
  const {
    media,
    transcriptCount,
    transcriptLanguage,
    formats,
    summaryCount,
    tags,
  } = item;
  // Mirrors LibraryRow's marker — the Library has two views and styling one and missing
  // the other is the easy mistake here.
  const local = media.platformId === LOCAL_PLATFORM_ID;
  const duration = formatDuration(media.durationSec);
  const platform = platformLabel(media.platformId);
  const PlatformMark = platformIcon(media.platformId);
  // First glyph of the title, so an un-thumbnailed poster carries something specific to *this*
  // entry. Falls back to the platform's initial for a title that starts with whitespace.
  const monogram = (media.title.trim()[0] ?? platform[0] ?? "•").toUpperCase();
  // Precomputed so the file row can render its two halves (clippable head, protected tail)
  // without doing the work inline.
  const [fileHead, fileTail]: [string, string] = media.downloadPath
    ? splitForMiddleClip(fileLabel(media.downloadPath, media.uploader))
    : ["", ""];

  // Tier 3, as text: language · quality · summaries. An errored format keeps the danger hue —
  // that is a status claim, and the one thing on this line allowed to shout.
  const meta: ReactNode[] = [];
  if (transcriptCount > 0 && transcriptLanguage) {
    meta.push(<span key="lang">{transcriptLanguage.toUpperCase()}</span>);
  }
  for (const f of formats) {
    meta.push(
      <span
        key={`fmt-${f.id}`}
        className={f.status === "error" ? "text-danger" : undefined}
      >
        {f.label}
      </span>,
    );
  }
  if (summaryCount > 0) {
    meta.push(
      <span key="summaries">
        {summaryCount} {summaryCount === 1 ? "summary" : "summaries"}
      </span>,
    );
  }

  return (
    <Card
      data-testid="media-card"
      data-local={local ? "true" : undefined}
      className={cn(
        // Thumbnail-forward: the poster is the card's top edge, so the surface has to clip.
        // Hover lifts the hairline, never a drop shadow (spec §1.3). The fill steps up to
        // surface-2 because these tiles sit *inside* the library panel — same-surface-on
        // -same-surface is what made the old grid read as flat.
        "group flex flex-col overflow-hidden bg-surface-2/60 transition-colors duration-150 hover:border-border-strong",
        "shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.04)]",
        local && "border-l-2 border-l-primary/70 bg-primary/[0.06]",
      )}
    >
      {/* The fallback sits under the image: a thumbnail that 404s (onError hides it) reveals a
          *designed* placeholder rather than a flat black rectangle. This is the largest element
          on the card, so it carries the most craft — a 145° warm ramp a full step darker than
          the card body (three tiles side by side used to read as one undifferentiated grey
          band), a hairline frame inset from the edge, and a monogram taken from the title so an
          un-thumbnailed tile still has an identity instead of a shared 16px film icon. The
          corner radius is stated explicitly so the poster's top edge matches the card's. */}
      <div
        className={cn(
          "relative aspect-video w-full shrink-0 overflow-hidden rounded-t-2xl border-b border-border",
          "bg-[linear-gradient(145deg,hsl(20_12%_8%),hsl(20_9%_4.5%))]",
          "shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.06)]",
        )}
      >
        {/* A soft pool of light behind the mark, so an empty poster is a lit surface rather
            than a hole. Painted first; a real thumbnail covers it. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(58%_58%_at_50%_44%,hsl(var(--foreground)/0.07),transparent_72%)]"
        />
        <div
          aria-hidden
          className="absolute inset-2.5 rounded-xl border border-white/[0.045]"
        />
        <div aria-hidden className="absolute inset-0 grid place-items-center">
          <span
            className={cn(
              "grid h-16 w-16 place-items-center rounded-2xl border border-white/[0.07] bg-white/[0.025]",
              "text-[26px] font-semibold leading-none tracking-tight text-fg-subtle/70",
              "shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.07)]",
            )}
          >
            {monogram}
          </span>
        </div>
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
        {/* Scrims, so the two corner chips sit on something whether the poster loaded or not.
            Plain alpha gradients — no backdrop-filter on a surface this list scrolls. The
            bottom one is the heavier of the two: it backs the duration pill, which would
            otherwise be a chip floating on flat black. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/45 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 via-black/25 to-transparent"
        />
        {/* Rim, painted over the poster: a loaded thumbnail keeps the same lit edge the
            placeholder has, so the two states of the poster share one silhouette. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.07]"
        />
        {/* Status is the one thing on a tile allowed a hue, so it keeps its tinted variant —
            over a solid backing, since a /12 fill is unreadable on a poster. The default state
            gets a slightly lighter backing (70 vs 80) so the neutral outline reads as the quiet
            member of the family rather than as the heaviest chip on the grid. */}
        <Badge
          data-testid="media-status"
          variant={STATUS_VARIANTS[media.downloadStatus]}
          className={cn(
            PILL,
            // 16px = the frame's own 10px inset plus 6px of clearance. At 10px the chip's
            // border landed *on* the frame line and the two 1px strokes fused into one thick
            // one, which read as a rendering fault rather than as a chip on a poster. Both
            // chips clear the frame now; neither touches it.
            "absolute left-4 top-4 px-2",
            media.downloadStatus === "none"
              ? "bg-background/70"
              : "bg-background/80",
          )}
        >
          {STATUS_LABELS[media.downloadStatus]}
        </Badge>
        {media.durationSec !== null && (
          // Same 16px clearance as the status chip, mirrored — see the note there.
          <span className="absolute bottom-4 right-4 flex h-5 items-center rounded-full bg-background/80 px-2 font-mono text-[11px] leading-none tabular-nums text-foreground/90 ring-1 ring-foreground/15">
            {duration}
          </span>
        )}
      </div>

      {/* Card body on a 6px / 10px rhythm. It used to be a uniform 20px between four
          equally-weighted chip rows, which gave the tile no reading order at all: the title
          now owns the block, the channel line sits 6px under it, the metadata line 6px under
          that, and only the things that are their own group (tags, the file, the actions) get
          the 10px step. */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex-1">
          <CardTitle
            data-testid="media-title"
            className="line-clamp-2 text-[15px] leading-snug"
          >
            {media.title}
          </CardTitle>

          {/* Tier 2: who it came from. The platform is a 14px monochrome mark in front of the
              name rather than a tinted pill — two pills that both had to be *read* to be told
              apart were spending colour and a whole line to say nothing. */}
          <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12.5px] leading-5 text-muted-foreground">
            <span
              data-testid="media-card-platform"
              title={platform}
              className="inline-flex shrink-0 items-center text-fg-subtle"
            >
              <PlatformMark aria-hidden className="h-3.5 w-3.5" />
              <span className="sr-only">{platform}</span>
            </span>
            <span className="min-w-0 truncate">
              {media.uploader ?? platform}
            </span>
          </p>

          {/* Tier 3: the qualifiers, as one quiet line. Language, quality and summary count are
              facts about the entry, not categories of it — they don't earn a pill each. */}
          {meta.length > 0 && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] leading-4 text-fg-subtle">
              {meta.map((node, i) => (
                <span key={i} className="inline-flex items-center gap-1.5">
                  {i > 0 && (
                    <span aria-hidden className="text-fg-disabled">
                      ·
                    </span>
                  )}
                  {node}
                </span>
              ))}
            </p>
          )}

          {hit &&
            (hit.field === "transcript" || hit.field === "summary") &&
            hit.snippet && (
              <div
                data-testid="search-snippet"
                className="mt-2.5 rounded-lg border border-border/70 bg-background/40 p-2.5 text-xs leading-relaxed text-muted-foreground"
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

          {/* The only chips left on the tile. Now that nothing else is a pill, a chip on this
              card means exactly one thing: a tag you can filter by. */}
          {tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
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
            </div>
          )}

          {media.downloadPath ? (
            // 8px of clearance on every side of the inset, so Open sits *inside* the box
            // instead of against its wall.
            <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-border bg-background/50 py-2 pl-3 pr-2">
              <FolderOpen
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 text-fg-subtle"
              />
              {/* Filename first, folder after — and the filename is cut in the *middle*, not at
                  the tail. Clipping the tail of `<channel>__<title>.ext` left the channel, which
                  the card names two lines above, and dropped both the title and the extension:
                  the row cost a line and said nothing. The channel prefix is gone (fileLabel)
                  and the extension is pinned (splitForMiddleClip). `title` still carries the
                  full path verbatim. */}
              <p
                data-testid="media-path"
                className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden font-mono text-[11px] leading-5"
                title={media.downloadPath}
              >
                {/* No gap between the two halves — they are one word split for clipping, so a
                    name that fits must show no seam. */}
                <span className="flex min-w-0 text-muted-foreground">
                  <span className="truncate">{fileHead}</span>
                  <span className="shrink-0">{fileTail}</span>
                </span>
                {lastFolder(media.downloadPath) && (
                  // Capped rather than free: a deep folder name would otherwise take the
                  // filename's space back, and a clipped *name* ("Downlo…") still reads where a
                  // clipped path never did.
                  <span className="max-w-[8rem] shrink-0 truncate text-fg-subtle">
                    <span aria-hidden>· </span>
                    {lastFolder(media.downloadPath)}
                  </span>
                )}
              </p>
              {/* Reveal-in-folder is a utility, not the card's point — Details is. A filled,
                  near-white-labelled control here outranked the outline button in the footer on
                  every downloaded card, so the hierarchy was inverted wherever a file existed.
                  It keeps its label and its shell, and loses the fill until hovered. */}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 rounded-lg px-2.5 text-[12px] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground"
                data-testid="media-reveal"
                onClick={() =>
                  void window.sift.library.reveal(media.downloadPath!)
                }
              >
                Open
              </Button>
            </div>
          ) : (
            /* The same slot, empty. Cards stretch to the tallest in their row, so one card with
               a file made every card beside it carry ~70px of bare surface between its last tag
               and the footer rule — a hole, not a field. This is the identical box at the
               identical 46px, one rung quieter (hairline at /60, no action), so the two states
               of a card share one skeleton and the footers land together because the bodies
               match rather than because the grid stretched them. Not dashed: dashes are this
               route's mark for a slot with no *card* in it (the grid's trailing ghosts), and a
               card that exists is not a placeholder. The line is a fact about the disk; the
               poster's chip is a fact about the download. */
            <div className="mt-2.5 flex h-[46px] items-center gap-2 rounded-lg border border-border/60 bg-background/30 px-3">
              <FolderOpen
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 text-fg-subtle"
              />
              <span className="text-[12px] leading-5 text-fg-subtle">
                No local file
              </span>
            </div>
          )}
        </div>

        {/* The one deliberate break in the rhythm: 14px of air, then a rule, then the actions —
            so Details and Remove read as a footer, not as two buttons adrift at opposite ends
            of an undivided gap. */}
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3"
            data-testid="media-open"
            onClick={() => onOpen(media.id)}
          >
            Details
          </Button>
          {confirming ? (
            <>
              <Button
                size="sm"
                variant="danger"
                className="h-8 px-3"
                data-testid="media-remove-confirm"
                onClick={() => onRemove(media.id)}
                title={local ? LOCAL_REMOVE_NOTE : undefined}
              >
                Confirm remove
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
              {local && (
                <span className="w-full text-[11px] leading-snug text-muted-foreground">
                  {LOCAL_REMOVE_NOTE}
                </span>
              )}
            </>
          ) : (
            // Icon-only, matching LibraryRow — label carried by aria-label/title, same
            // bordered h-8 shell as Details so both actions read at the same weight.
            <Button
              size="icon-sm"
              variant="ghost"
              data-testid="media-remove"
              aria-label="Remove"
              title="Remove"
              className={cn(ICON_ACTION, "ml-auto")}
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
