import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/**
 * **The one pill geometry in the app.** Badge, tag chip, platform mark, counter, binary
 * version — every small pill is this exact box, so three of them landing in the same Library
 * row share a height and a baseline instead of stacking three slightly different boxes.
 *
 * One height (20px), one radius (`rounded-full`), one padding (`px-2`), one type spec
 * (11px/500). Four ad-hoc chip treatments used to appear inside a single Library detail
 * panel — a filled tracked-uppercase one, an outlined one, a filled tinted one and a tiny
 * circular counter — and none of the differences encoded a difference in meaning, so the eye
 * had to re-learn each one. Uppercase + letter-spacing now live on exactly one variant
 * (`code`), where they mean "this is an identifier, not prose".
 *
 * The height is fixed rather than derived from padding so a chip cannot grow a pixel when a
 * caller adds an icon; the inset top highlight is the bevel trick the panels use, scaled
 * down, and is what stops a flat translucent fill reading as a grey rectangle.
 */
export const PILL_BOX = [
  "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full border px-2",
  "text-[11px] font-medium leading-none",
  "shadow-bevel",
  "[&_svg]:h-3 [&_svg]:w-3 [&_svg]:shrink-0",
].join(" ");

/**
 * **The closed set of pill tones.** There is no other one — `tag-chip.tsx` renders these same
 * strings, so a platform badge, a language badge and a status badge can never again come from
 * three unrelated colour systems in one row.
 *
 * | tone | spend it on |
 * |---|---|
 * | `neutral` | chrome: platform, versions, "Not installed" — anything that is not a claim |
 * | `outline` | the same, when it sits *on* a filled surface and a second fill would muddy it |
 * | `count`   | a number in a tab or a header. Never tinted: a count is not a status |
 * | `code`    | identifiers — `YTDLP-SUBS`, model ids, format codes |
 * | `tag`     | a static label that is NOT a control (see the note below) |
 * | `accent`  | media actions and the source they act on (softened coral, see below) |
 * | `ai`      | AI, summarize, whisper, transcript language — nothing else |
 * | `success` `warning` `danger` | a status readout with a tinted opposite (see below) |
 * | `solid`   | the one badge per view that must shout |
 *
 * `accent`'s label is a *softened* coral rather than `--primary` itself: full `#FF6A3D` is
 * reserved for the primary CTA and the active nav item — the two things on a screen that mean
 * ACTION and STATE — and a row full of it would flatten both. Fill and border still come
 * straight from the token, so the whole pill moves when the token does.
 *
 * **`tag` is deliberately borderless.** A bordered pill at control height is the `Button`
 * `secondary` shell; ten static platform labels wearing it read as ten fake buttons sitting
 * above two real ones, and the real ones stop looking clickable. Static label → no border,
 * flat `surface-2` fill. Clickable → `Button`.
 *
 * **Where the hue lives: the dot, or the shell — never both, and the choice is not free.**
 * "This is fine" had three shapes on one screen (a dark pill with a green dot and a white
 * label, a green-tinted pill with a green label and no dot, and bare green text with a dot and
 * no pill), so the eye had to re-learn the vocabulary three times in one column. Two forms
 * survive, and they are told apart by whether the pill has neutral neighbours:
 *
 * - **Neutral shell + a hued `ChipDot`** — a fact or a state about the object in front of you,
 *   sitting in a row of other metadata chips: the platform tier ("Tested"), what is already
 *   captured, "Saved to Library". The shell is `neutral`, identical to every chip beside it,
 *   and the dot alone carries the meaning. This is the common case; reach for it by default.
 * - **A tinted pill** (`success`/`warning`/`danger`, fill + border + text from one hue) — a
 *   readout that only exists as one member of a mutually exclusive set, where the hue *is* the
 *   difference between the members and there is no neutral chip beside it to be confused with:
 *   "Installed" vs "Setup needed", "Installed" vs "Update available" in Settings.
 *
 * The failure this replaces is the two forms landing on one screen carrying one semantic: a
 * green-dotted "Tested" in a preview header and a green-tinted, green-dotted "Saved to
 * Library" 200px below it, both meaning "good", disagreeing only about the shell.
 */
export const PILL_TONES = {
  neutral: "border-transparent bg-foreground/[0.08] text-foreground/80",
  outline: "border-foreground/20 bg-transparent text-muted-foreground",
  count:
    "border-transparent bg-foreground/[0.10] text-muted-foreground tabular-nums",
  code: "border-transparent bg-foreground/[0.08] text-muted-foreground uppercase tracking-[0.08em]",
  tag: "border-transparent bg-surface-2 text-muted-foreground",
  accent: "border-primary/30 bg-primary/14 text-[hsl(18_100%_73%)]",
  ai: "border-ai/30 bg-ai/14 text-ai",
  success: "border-success/30 bg-success/14 text-success",
  warning: "border-warning/30 bg-warning/14 text-warning",
  danger: "border-danger/30 bg-danger/14 text-danger",
  solid: [
    "border-transparent bg-gradient-to-br from-primary to-primary-lit",
    "text-primary-foreground font-semibold",
    "shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.22)]",
  ].join(" "),
} as const;

export type PillTone = keyof typeof PILL_TONES;

/**
 * Tinted pills. One hue drives all three channels — translucent fill, tinted border, text at
 * the hue — so a badge never reads as grey-on-grey.
 *
 * `default` is the historical variant name and stays forever (every call site relies on the
 * default); it is an alias onto the closed set above, not an extra colour system.
 */
export const badgeVariants = cva(
  cn(PILL_BOX, "transition-colors duration-150 ease-out"),
  {
    variants: {
      variant: {
        default: PILL_TONES.accent,
        outline: PILL_TONES.outline,
        neutral: PILL_TONES.neutral,
        count: cn(PILL_TONES.count, "min-w-5 justify-center px-1.5"),
        code: PILL_TONES.code,
        tag: PILL_TONES.tag,
        accent: PILL_TONES.accent,
        ai: PILL_TONES.ai,
        success: PILL_TONES.success,
        warning: PILL_TONES.warning,
        danger: PILL_TONES.danger,
        solid: PILL_TONES.solid,
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /**
   * Leading 6px dot drawn in the pill's **own** hue (`bg-current`, so it can never drift from
   * the label). Presentational only — the pill always carries its text, so nothing here
   * encodes meaning in colour alone, and the accessible name is unchanged.
   *
   * For a *tinted* pill that needs a state marker. A neutral pill wants `ChipDot` instead
   * (see tag-chip.tsx): there the hue is the whole message, so it has to be passed in rather
   * than inherited from a grey label. Either way, chrome — a version, a count, a format code
   * — gets no dot at all: a dot says "this is a state", and a format code is not a state.
   */
  dot?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, dot, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    >
      {dot && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 flex-none rounded-full bg-current"
        />
      )}
      {children}
    </span>
  ),
);
Badge.displayName = "Badge";

/**
 * **A static label — not a control.** Use it for lists of things the app merely *knows*
 * (tested platforms, detected extractors, supported formats). It hugs its label, has no
 * border, and sits a step lighter than the card it's on, so it can never be mistaken for the
 * bordered, 40px, hover-lifting pill that means "you can click this".
 *
 * `sm` (18px) for dense secondary lists, `md` (22px) for a primary list. Both hug width —
 * do not stretch them into equal-width grid columns; a five-column grid gives "YouTube" 60px
 * of dead padding while "X (Twitter)" sits snug, which reads as a layout bug.
 */
export const Tag = forwardRef<
  HTMLSpanElement,
  HTMLAttributes<HTMLSpanElement> & { size?: "sm" | "md" }
>(({ className, size = "md", ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full",
      "bg-surface-2 font-medium text-muted-foreground",
      "[&_svg]:h-3 [&_svg]:w-3 [&_svg]:shrink-0",
      size === "sm" ? "h-[18px] px-2 text-[11px]" : "h-[22px] px-2.5 text-xs",
      className,
    )}
    {...props}
  />
));
Tag.displayName = "Tag";
