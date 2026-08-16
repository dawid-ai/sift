import { X } from "lucide-react";
import { PILL_BOX, PILL_TONES } from "@/components/ui/badge";
import { tagColor } from "@/lib/tag-color";
import { cn } from "@/lib/utils";

export interface TagTint {
  /** Halo behind the dot — the hue at dot-scale alpha. */
  fill: string;
  /** Tinted hairline, kept for callers that want a hue-matched edge. */
  line: string;
  /** The hue at full strength, light enough to read on Ember surfaces. Dot only. */
  text: string;
  /**
   * The chip body. **Not a per-tag value any more** — see the note on `tagTint`. It resolves
   * to the app's single neutral pill fill so a caller that still reaches for it lands on the
   * same rectangle `CHIP_SHELL` paints, rather than minting a second one.
   */
  pill: string;
  /** The chip's hairline. Same story as `pill`: the shared neutral edge, not a per-tag one. */
  edge: string;
}

/**
 * A tag's ramp stop, for the 6px **dot** in the tag-editor's suggestion list.
 *
 * It used to render the whole pill (fill · edge · label), and that was the last place a second
 * neutral pill fill survived: metadata chips (`YouTube`, `Tested`, `EN`, `ytdlp-subs`) filled
 * at `foreground/[0.08]` → rgb(46,42,41), while tag chips 90px away filled at `white/[0.06]` →
 * rgb(31,28,28), with the same full radius and the same 11px label. Two neutral fills, one
 * geometry, no difference in role a reader can decode — they read as one object rendered
 * twice at two strengths. `lib/tag-color.ts` had already collapsed the palette to a single
 * warm near-neutral, so the second fill was not even carrying a hue: it was carrying an
 * accident of alpha.
 *
 * The chip body is `CHIP_SHELL` now, full stop. What survives here is what a hue can still
 * legitimately mark — a dot — and the values below are pinned to the shared neutral so the
 * body/edge fields cannot reintroduce the fork. Colour on a tag means exactly one thing:
 * `TAG_SELECTED` below.
 */
export function tagTint(name: string): TagTint {
  const { hue, sat } = tagColor(name);
  return {
    fill: `hsl(${hue} ${sat}% 84% / 0.14)`,
    line: `hsl(${hue} ${sat}% 86% / 0.2)`,
    text: `hsl(${hue} ${sat}% 63%)`,
    pill: "hsl(var(--foreground) / 0.08)",
    edge: "transparent",
  };
}

/**
 * The one place a tag is allowed to be coral: *this tag is currently filtering the view*.
 * Nothing else about a tag is chromatic, so a selected tag is unmissable without the app
 * having to spend the accent anywhere else.
 */
export const TAG_SELECTED = "border-primary/40 bg-primary/14 text-[hsl(18_100%_73%)]";

/**
 * The chip geometry. Re-exported from `ui/badge` so a tag chip and a platform badge sitting in
 * the same Library row are literally the same box — see `PILL_BOX` for the reasoning.
 */
export const CHIP_BOX = PILL_BOX;

/**
 * Semantic hues for chips — the same closed set `Badge` uses, aliased under the older chip
 * names so existing call sites keep compiling. Three categories of metadata on one table row
 * rendered as three identical grey pills is unscannable; three categories rendered from three
 * *unrelated* colour systems is worse. One table, one vocabulary:
 *
 * | tone | spend it on |
 * |---|---|
 * | `neutral` / `sand` | chrome: counters, versions, formats, "File 2 of 5" — not a claim |
 * | `count`    | a bare number in a tab or header — never tinted; a count is not a status |
 * | `code`     | identifiers: `YTDLP-SUBS`, model ids, format codes |
 * | `accent`   | source / platform, and "the new thing" (an offered version) |
 * | `info` / `ai` | AI, summarize, whisper, transcript language |
 * | `success` `warning` `danger` | a status readout with a tinted opposite — see `Badge` |
 *
 * `info` and `sand` used to be a cyan and a khaki mixed by hand. They now resolve to `ai` and
 * `neutral`; the names survive, the extra colour systems do not.
 */
export type ChipTone =
  | "neutral"
  | "count"
  | "code"
  | "accent"
  | "info"
  | "sand"
  | "ai"
  | "success"
  | "warning"
  | "danger";

export const CHIP_TONES: Record<ChipTone, string> = {
  neutral: PILL_TONES.neutral,
  count: PILL_TONES.count,
  code: PILL_TONES.code,
  accent: PILL_TONES.accent,
  info: PILL_TONES.ai,
  sand: PILL_TONES.neutral,
  ai: PILL_TONES.ai,
  success: PILL_TONES.success,
  warning: PILL_TONES.warning,
  danger: PILL_TONES.danger,
};

/** `className={chipClass("ai")}` — the box plus one semantic hue. */
export function chipClass(tone: ChipTone = "neutral", className?: string): string {
  return cn(CHIP_BOX, CHIP_TONES[tone], className);
}

/**
 * The neutral chip, kept as a bare string so existing `className={CHIP_SHELL}` call sites
 * keep working. New code should prefer `chipClass(tone)` and only fall back to `neutral`
 * for genuine chrome.
 */
export const CHIP_SHELL = `${CHIP_BOX} ${CHIP_TONES.neutral}`;

/** Opt-in hover for neutral chips that are themselves a click target. */
export const CHIP_HOVER = [
  "transition-colors duration-150 ease-out motion-reduce:transition-none",
  "hover:border-foreground/[0.22] hover:bg-foreground/[0.12] hover:text-foreground",
].join(" ");

/**
 * Hover for the tag chip: a whole-surface inset white wash rather than a fill swap. It lifts
 * the chip a step without touching its hairline — a tag is a label first and a click target
 * only in some of the places it appears, so popping a border in on hover would promise an
 * affordance that isn't always there (that is what `CHIP_HOVER` above is for). The bevel
 * highlight is re-declared in the same shadow so `shadow-bevel` isn't dropped on hover.
 */
const CHIP_HOVER_TINTED =
  "hover:shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.14),inset_0_0_0_999px_hsl(0_0%_100%/0.05)]";

/**
 * The 6px semantic dot that opens a chip or a list row. Purely decorative — whatever it
 * marks always carries its own text, so nothing here encodes meaning in colour alone.
 */
export function ChipDot({
  color,
  halo,
  className,
}: {
  color: string;
  halo?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("h-1.5 w-1.5 flex-none rounded-full", className)}
      style={{ backgroundColor: color, boxShadow: halo ? `0 0 0 2.5px ${halo}` : undefined }}
    />
  );
}

/**
 * **The tag chip is the neutral chip.** Same box, same fill, same hairline, same label rung as
 * every other pill in the app — it takes `CHIP_SHELL` rather than an inline style, so there is
 * exactly one neutral pill fill in the renderer and a tag sitting in a Library row beside a
 * platform badge is visibly the same object rather than a dimmer imitation of it.
 *
 * Nothing about a tag is chromatic. The palette is one stop (see `lib/tag-color.ts`), so a
 * per-tag hue was only ever a "these are different strings" affordance — and the tag's own
 * text does that job. A grey dot in front of it would add nothing and would borrow the one
 * shape (`Badge … dot`) that means "this is a state".
 */
export function TagChip({ name, onRemove }: { name: string; onRemove?: () => void }) {
  return (
    <span
      data-testid="tag-chip"
      data-tag={name}
      className={cn(CHIP_SHELL, CHIP_HOVER_TINTED, "max-w-[16rem]", onRemove && "pr-1.5")}
    >
      <span className="truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove tag ${name}`}
          className={cn(
            // Inherits the chip's own (neutral) colour until you reach for it, then commits
            // to destructive red — unmistakable on hover, silent at rest. Same red as every
            // other destructive control in the app; there is only one.
            "grid h-4 w-4 flex-none place-items-center rounded-full opacity-65",
            "transition-[color,background-color,opacity] duration-150 ease-out",
            "hover:bg-danger/20 hover:text-danger hover:opacity-100",
            "focus-visible:text-danger focus-visible:opacity-100",
            "motion-reduce:transition-none",
          )}
          onClick={onRemove}
        >
          <X className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
        </button>
      )}
    </span>
  );
}
