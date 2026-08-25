import { useEffect, useState } from "react";
import type {
  ComponentType,
  HTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { motion } from "framer-motion";
import { branding, listTestedPlatforms } from "@sift/core";
import {
  Activity,
  Captions,
  Check,
  ChevronDown,
  Cog,
  FlaskConical,
  FolderOpen,
  Globe,
  KeyRound,
  Languages,
  Laptop,
  Archive,
  FolderSearch,
  HardDrive,
  LifeBuoy,
  MessageSquareText,
  Mic,
  Package,
  Network,
  PackageOpen,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  TriangleAlert,
  Wrench,
  Zap,
} from "lucide-react";
import type { DiagnosticsReport } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UpdateState } from "@/lib/update-state";
import { AiProvidersSection } from "./ai-providers-section";
import { BinariesSection } from "./binaries-section";
import { DownloadsSection } from "./downloads-section";
import { PlatformsSection } from "./platforms-section";
import { PromptsSection } from "./prompts-section";
import { PromptPlaygroundSection } from "./prompt-playground-section";
import { SigninSection } from "./signin-section";
import { TranscriptLanguageSection } from "./transcript-language-section";
import { TranscriptMethodSection } from "./transcript-method-section";
import { AutoTranscriptSection } from "./auto-transcript-section";
import { NetworkSection } from "./network-section";
import { ProfileSection } from "./profile-section";
import { StorageSection } from "./storage-section";
import { LanguagesSection } from "./languages-section";
import { WatchFoldersSection } from "./watch-folders-section";
import { BackupSection } from "./backup-section";
import { UpdatesSection } from "./updates-section";
import { WhisperSection } from "./whisper-section";

/* ------------------------------------------------------------------------------------------
   The settings kit.

   Three columns inside a FIXED-HEIGHT frame. The frame is exactly one viewport tall and
   only the centre column scrolls, so both flanking lanes are surfaces that always reach the
   window edge — nothing sticks, nothing jumps at scroll end, nothing detaches from the
   bottom of the window:

     left   200px  nav card, with the index of the open tab stacked directly beneath it
     centre        the hero + the section cards, capped at a readable measure — THE scroller
     right  312px  a tinted lane with its own left edge, one stack of standing facts

   The rail is DOCKED CHROME, so it runs to the right edge of the frame and is padded
   symmetrically (`px-6`): it used to be `pl-6` only inside the frame's `px-7`, which put 24px
   of air on the card's left and 0px on its right — the card's border landed exactly on the
   lane's own edge — and then stopped 38px short of the window. The frame therefore drops its
   right padding wherever the rail is shown (`xl:pr-0`) and the rail pays for its own gutters.

   Both flanks are `justify-start`: a block is never pushed to the base of its column, which
   is what previously opened a 524px hole in the middle of the nav and 310px in the rail.

   PADDING — one scale, no exceptions:

     --pad-card    24px  (`p-6`)  the hero and every section card in the centre column
     --pad-card-sm 16px  (`p-4`)  the compact right rail and every nested block
     --pad-nav     12px  (`p-3`)  the two nav cards, whose rows carry their own px-2 / px-3

   EVERY block is a card. The two lists that used to trail their column as a bare `border-t`
   block — the page index under the nav, the status key under the rail — sat 17–21px left of
   the identical eyebrow above them, because a card's interior padding is real and a bare
   block has none. Nothing is allowed to end a column outside the card vocabulary.

   ELEVATION LADDER — exactly three steps, and never two bordered surfaces nested:

     1. card          bordered + inset top highlight + drop shadow   (SECTION_SURFACE)
     2. nested block  filled, NO border, no shadow                   (NESTED_SURFACE)
     3. rows          no surface at all, separated by a hairline      (ROW_LIST)

   LABELS — three tiers, and the eyebrow role has exactly ONE form (see EyebrowRow). The
   page header used to be a saturated amber word while eight identical labels below it were
   dim-white-plus-glyph: same size, same tracking, two structures for one rank. Now the hero
   wears the same glyph + dim label as every card, and saturated amber is spent only on the
   active nav pill and the primary CTA.

     EyebrowRow   warm glyph + CardEyebrow — the identity strip on ANY card, hero included
     CardEyebrow  10px uppercase, dim white
     GroupLabel   12px semibold sentence case — HEADS a group or a nested block
     MicroLabel   11px, muted — names a strip INSIDE a row or slot, never heads a block

   Counts are DATA, not decoration: CountTag is a tinted amber pill, never grey-on-grey.

   CONTROLS — two heights only: 44px (`size="lg"` + <Input>) for standalone fields and the
   buttons beside them, 36px (`size="sm"`) for in-row actions. Everything is `rounded-xl`.
   ------------------------------------------------------------------------------------------ */

/** Step 1 of the ladder. The only bordered surface on the page. */
export const SECTION_SURFACE = [
  "rounded-2xl border border-[hsl(24_10%_17%)] bg-[hsl(24_12%_9%)]",
  "shadow-[inset_0_1px_0_hsl(24_20%_20%/0.35),0_10px_30px_-18px_hsl(0_0%_0%/0.9)]",
].join(" ");

/** The hero. Same fill and hairline as every other card — the only difference is a slightly
 * brighter top edge, so it reads as first among equals.
 *
 * It used to wear `.panel-lit`, whose rim tops out near white (lum 181) and which throws a
 * 44px amber bloom: that made a decorative hairline the brightest non-text pixel in the app,
 * out-shouting the one primary CTA on three screens of settings. The rim is now a 14%-white
 * inset line and the bloom is gone entirely. */
const HERO_SURFACE = [
  "rounded-2xl border border-[hsl(24_10%_17%)] bg-[hsl(24_12%_9%)]",
  "shadow-[inset_0_1px_0_hsl(0_0%_100%/0.14),0_18px_44px_-30px_hsl(0_0%_0%/0.9)]",
].join(" ");

/** The centre column is the page's only scroller, so its bar sits mid-page rather than at
 * the window edge: 6px thumb-only, the same treatment the media detail pane uses. */
const THIN_SCROLLBAR = [
  "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent",
  "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-0",
  "[&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:[background-clip:border-box]",
  "hover:[&::-webkit-scrollbar-thumb]:bg-white/20",
].join(" ");

/** Step 2. Fill only — a border here would collide with the section card's own hairline. */
export const NESTED_SURFACE =
  "rounded-xl border border-transparent bg-[hsl(24_10%_12%)]";

/** Step 3. Rows are not objects; a hairline is all that separates them. */
export const ROW_LIST = "divide-y divide-white/[0.05]";

/** Dividers inside a card. One step LIGHTER than the card border, so the reading order is
 * card edge → divider, never the two competing. Always paired with a full-bleed pair below. */
export const SECTION_RULE = "border-white/[0.05]";

/** A divider must span the whole card, not float 24px short of both edges. Negative margin
 * out to the card edge, padding back in for the content. One pair per padding step. */
export const FULL_BLEED = "-mx-6 px-6";
export const FULL_BLEED_SM = "-mx-4 px-4";

/** Every field on this page — <Input>, <select>, <textarea>, and the read-only path shell —
 * sits on the SAME recessed surface: a well cut into the card, a real hairline at rest, and
 * an amber focus ring. A field that only appears on focus reads as browser-native chrome.
 *
 * The placeholder rides the shared `--placeholder` token, NOT a local alpha. This array is
 * merged after <Input>'s own classes, so a `placeholder:text-foreground/30` here silently
 * reverted the token the shared Input already uses — on the Platforms search, whose only
 * label IS its placeholder, that measured 2.59:1 and the field read as an empty box. Keeping
 * the token here (rather than dropping the utility) also covers the route-local <textarea>
 * and <select>, which have no Input classes of their own to inherit. */
export const FIELD = [
  "border-white/[0.07] bg-black/25 placeholder:text-placeholder",
  "hover:border-white/[0.13] focus:border-primary/40 focus:bg-black/25",
  "focus:ring-2 focus:ring-primary/15",
].join(" ");

/** Destructive in-row actions (remove a session, delete a prompt, drop a language) must not
 * be indistinguishable from a benign Refresh/Check. Red ghost with a border a step lighter
 * than the safe action beside it, so the safe one stays the louder of the two.
 * Pair with `variant="ghost"`.
 *
 * The BORDER carries the "quieter" relationship, never the ink: at `danger/80` the label
 * composited to 3.47:1 on the nested surface at 12px, and this is the only way to drop a
 * saved session. Full-hue danger lands at ~4.71:1 and the /20 hairline still reads a step
 * back from the safe action beside it. */
export const DESTRUCTIVE_ACTION = [
  "border border-danger/20 text-danger",
  "hover:border-danger/30 hover:bg-danger/10 hover:text-danger",
].join(" ");

/** Card identity strip. Deliberately NOT amber: saturated amber is reserved for the active
 * nav pill and the primary CTA, so nine identical labels can't spend the accent before the
 * eye reaches the one button that matters. Normally wrapped by EyebrowRow. */
export function CardEyebrow({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "text-[10px] font-semibold uppercase leading-4 tracking-[0.16em] text-fg-subtle",
        className,
      )}
      {...props}
    />
  );
}

/** The ONE eyebrow form on this page — hero, section cards and rail cards all use it, so a
 * label's rank is never announced two different ways.
 *
 * The glyph is decorative and never interactive, but "decorative" is not a licence to be
 * invisible: at `primary/40` these icons sat near 1.8:1 on the card and read as smudges at
 * 14px. `--accent-muted` is the same hue held at a legible saturation (4.1:1), and it is the
 * token the palette designates for exactly this job — eyebrow and card glyphs. It was spelled
 * `#C4622F` here, one unit off the token's own value, which is how a palette drifts. */
const EYEBROW_GLYPH = "text-accent-muted";

function EyebrowRow({
  icon: Icon,
  children,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span aria-hidden className={cn("flex shrink-0", EYEBROW_GLYPH)}>
        <Icon className="h-[14px] w-[14px]" />
      </span>
      <CardEyebrow>{children}</CardEyebrow>
    </div>
  );
}

/** Section shell. Eyebrow + title + description share ONE left edge with everything below
 * them; the icon is a small warm glyph on the eyebrow baseline, not a boxed pseudo-button. */
export function SettingsSection({
  eyebrow,
  title,
  count,
  description,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  /** ONE rule, and it is why no card passes this today: an H2 count must count the rows
   * rendered under that H2. Platforms wore one that counted the ten tested platforms while
   * the block 130px below counted the extractors actually listed — the same pill, the same
   * hue, two numbers, no legend. A figure that is a fact rather than a tally belongs in the
   * description, where it can say what it is counting. */
  count?: ReactNode;
  description: ReactNode;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <section className={cn(SECTION_SURFACE, "p-6")}>
      {/* Non-interactive: no border, no box, no hit area — it reads as part of the label. */}
      <EyebrowRow icon={Icon}>{eyebrow}</EyebrowRow>
      <h2 className="mt-2.5 flex items-center text-[19px] font-semibold leading-tight tracking-[-0.015em] text-foreground">
        {title}
        {count !== undefined && <CountTag>{count}</CountTag>}
      </h2>
      <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-foreground/60 [text-wrap:pretty]">
        {description}
      </p>
      <div className={cn("mt-5 border-t pt-5", SECTION_RULE, FULL_BLEED)}>
        {children}
      </div>
    </section>
  );
}

/** The one row pattern: label + helper on the left, control right-aligned, hairline between. */
export function SettingRow({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-3",
        "border-b border-white/[0.05] py-3.5 first:pt-0 last:border-b-0 last:pb-0",
        className,
      )}
    >
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-medium leading-snug text-foreground">
          {label}
        </p>
        {hint && (
          <p className="mt-1.5 max-w-[62ch] text-[12px] leading-relaxed text-foreground/60 [text-wrap:pretty]">
            {hint}
          </p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </div>
  );
}

/** Step 2 of the ladder — a filled, borderless block. Its label lives *inside* it. */
export function SubPanel({
  label,
  count,
  action,
  className,
  children,
  ...rest
}: {
  label?: ReactNode;
  count?: ReactNode;
  action?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(NESTED_SURFACE, "p-4", className)} {...rest}>
      {(label || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {label ? (
            <div className="flex min-w-0 items-center">
              {/* Block header, so GroupLabel — see MicroLabel's note below. */}
              <GroupLabel>{label}</GroupLabel>
              {count !== undefined && <CountTag>{count}</CountTag>}
            </div>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/** Label tier 2 — heads a group inside a card, INCLUDING the header of a nested block.
 * Sentence case and near-white on purpose: an uppercase tracked label here would read as a
 * second eyebrow competing with the card's own. */
export function GroupLabel({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "text-[12px] font-semibold leading-4 text-foreground/70",
        className,
      )}
      {...props}
    />
  );
}

/** Label tier 3 — names a strip that has opened up INSIDE a row or a slot ("Editing",
 * "Endpoint", "Downloading model…"). Sentence case, muted, untracked.
 *
 * It is NOT a block header. "Extractors" and "Saved sessions" are one structural role —
 * the header of a nested block, immediately followed by a CountTag — and were rendering at
 * two sizes, two weights and two brightnesses 350px apart on the same screen. Anything that
 * heads a block is a GroupLabel. */
export function MicroLabel({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "text-[11px] font-medium leading-4 text-foreground/55",
        className,
      )}
      {...props}
    />
  );
}

/** The ONE way this page renders "how many". A count is DATA, so it is tinted like data —
 * a grey pill on a grey card is a smudge, not a number. Always sits right after the label
 * it counts, never floats at the far edge of a card, never carries a trailing noun. */
export function CountTag({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "-mt-px ml-2 inline-flex shrink-0 items-center rounded-full border border-primary/25",
        "bg-primary/12 px-1.5 py-0.5 text-[11px] font-medium leading-4 tabular-nums",
        "text-[hsl(20_95%_72%)]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Native `<select>`, styled. An unstyled select is the loudest "unfinished" tell on a dark
 * page — Chromium paints its own chevron and a light shell — so the arrow is ours and the
 * shell matches Input. `appearance-none` is presentation only; the popup stays native
 * (globals.css colours `option`, and `color-scheme: dark` keeps the list dark).
 */
export function SettingsSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative inline-flex min-w-0 items-center">
      <select
        className={cn(
          "h-11 min-w-0 max-w-[16rem] appearance-none truncate rounded-xl border",
          "py-0 pl-3.5 pr-9 text-sm text-foreground transition-colors duration-150 ease-out",
          FIELD,
          "focus:outline-none focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-foreground/40"
      />
    </span>
  );
}

/** Textarea with the Input shell. Pass `font-mono` where the content is code-ish.
 *
 * `resize-y`: Chromium's default is `both`, and a horizontal drag pulls the field straight
 * past the card's own hairline — a control that can be dragged outside the surface it lives
 * on. The vertical axis is the one that helps (a 40-line prompt), and it cannot break the
 * layout, so it stays: this is not the place to delete an editing affordance. */
export function SettingsTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full resize-y rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed text-foreground",
        "transition-colors duration-150 ease-out",
        FIELD,
        "focus:outline-none focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/** Tinted danger block. Every section reports failures the same way. */
export function SettingsError({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/12 px-3 py-2",
        "text-xs leading-relaxed text-danger",
        className,
      )}
      {...rest}
    >
      <TriangleAlert aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

/** Muted footnote under a control. 12px at ~5:1, held to a readable measure, and
 * balanced so a four-word orphan never strands on its own last line. */
export function SettingsHint({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "max-w-[62ch] text-[12px] leading-relaxed text-foreground/60 [text-wrap:pretty]",
        className,
      )}
      {...props}
    />
  );
}

/** Dashed slot — the reference's language for "nothing here yet". */
export function SettingsEmpty({
  icon: Icon,
  title,
  hint,
  className,
  ...rest
}: {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  hint?: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "title">) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/[0.10] px-4 py-7 text-center",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden
        className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-foreground/45"
      >
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-sm font-medium text-foreground/85">{title}</p>
      {hint && (
        <p className="max-w-[46ch] text-[12px] leading-relaxed text-foreground/55 [text-wrap:pretty]">
          {hint}
        </p>
      )}
    </div>
  );
}

/** The one status vocabulary on this page: a haloed dot AND a word. Colour never carries
 * the meaning on its own. Reused by any list that shows a live/stale state. */
export function StatusDot({
  tone,
  label,
}: {
  tone: "ok" | "warn";
  label: string;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full ring-4",
          tone === "ok"
            ? "bg-success ring-success/10"
            : "bg-warning ring-warning/10",
        )}
      />
      {/* 12px, like every other line of copy in the rail. At 11px this word was the only
          text in the lane at that size, and it sat on one baseline with a 12px description
          beside it — two sizes inside a single row. */}
      <span
        className={cn(
          "text-[12px] font-medium leading-4",
          tone === "ok" ? "text-success/80" : "text-warning/85",
        )}
      >
        {label}
      </span>
    </span>
  );
}

type TabId = "general" | "transcription" | "ai" | "system";
const TABS: {
  id: TabId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "transcription", label: "Transcription", icon: Captions },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "system", label: "System", icon: Wrench },
];

/** Mirrors the section titles rendered per tab — the index pinned to the base of the nav
 * column, so the shortest column ends on content instead of 660px of empty tint. */
const TAB_INDEX: Record<TabId, string[]> = {
  general: ["Downloads", "Platforms", "Sign-in browser"],
  transcription: [
    "Transcript method",
    "After a download",
    "Transcript language",
    "Whisper",
  ],
  ai: ["AI providers", "Prompts", "Prompt playground"],
  system: ["Binaries", "Updates", "Diagnostics"],
};

/** The hero, driven by the open tab — one table, beside the index it mirrors.
 *
 * The `<header>` used to sit outside the `tab === …` switch, so the page's largest type —
 * 32px, above the fold, on every one of the four tabs — was byte-identical everywhere: a
 * sentence that enumerated all four sections and named none, leaving a 13px pill in a 200px
 * side card as the only signal of where you were. The eyebrow, the title and the subtitle now
 * all move with `tab`, so the biggest object on screen is also the most stateful one.
 *
 * Two rules held the copy: every eyebrow is a word no card ON THAT TAB wears (a page eyebrow
 * that repeats the card below it carries no information — that is why three card eyebrows
 * changed with it), and every subtitle names that tab's own cards rather than restating a
 * sentence one of them already prints 200px below. */
const HERO: Record<TabId, { eyebrow: string; title: string; sub: string }> = {
  general: {
    eyebrow: "SETTINGS",
    title: `How ${branding.appName} behaves.`,
    sub: `Downloads, platforms and the browser ${branding.appName} signs in with.`,
  },
  transcription: {
    eyebrow: "TRANSCRIPTION",
    title: "How transcripts are made.",
    sub: `Captions, Whisper and the languages ${branding.appName} prefers.`,
  },
  ai: {
    eyebrow: "PROVIDERS",
    title: "Which model does the writing.",
    sub: "Keys, prompts and a place to test them.",
  },
  system: {
    eyebrow: "TOOLCHAIN",
    title: `The binaries ${branding.appName} drives.`,
    sub: "yt-dlp, ffmpeg and Deno, plus app updates.",
  },
};

/** What is kept on this machine, and where. Plain statements of existing behaviour. */
const LOCALITY: { what: string; where: string }[] = [
  { what: "Media files", where: "This machine" },
  { what: "Transcripts", where: "This machine" },
  { what: "API keys", where: "OS keystore" },
];

const TESTED_PLATFORM_COUNT = listTestedPlatforms().length;

/* The hero used to end in a three-up stat band: TESTED PLATFORMS 10 / AI PROVIDERS 5 /
   MANAGED TOOLS 3. None of those are user state, and two of the three were already printed
   verbatim within one screen — "10" also rode the Platforms H2 and is spelled out as chips
   400px below, whose description is the same sentence as the tile's caption; "yt-dlp, ffmpeg
   and Deno" was the rail card visible at the same time. A band that restates its neighbours is
   the weakest carrier of every fact in it, so the band went — and so, later, did the H2 count
   that had come to stand for a list nothing on screen showed. Ten is a fact about which
   platforms are TESTED, not a count of anything rendered, so it is prose in the Platforms
   description; the only tinted counts left are the ones that count rows you can see. */

/**
 * The right flank of `.app-canvas` carries a cool violet counterweight that reads as a
 * stray layer on a page this warm. This is a viewport-anchored warm wash that pulls that
 * corner back into the brown/amber family — same hue as everything else, very low alpha.
 * Purely decorative, never interactive.
 */
const WARM_WASH =
  "radial-gradient(58% 62% at 104% 62%, hsl(20 28% 4% / 0.82), transparent 72%)," +
  "radial-gradient(46% 40% at 100% 100%, hsl(20 30% 4% / 0.9), transparent 74%)," +
  "radial-gradient(34% 26% at 97% 94%, hsl(22 92% 52% / 0.06), transparent 70%)";

/**
 * Support bundle: shows exactly what would be written, then writes it where the user
 * picks. Showing the contents first is the point — a bundle nobody can inspect is one
 * nobody should be asked to attach to a public issue.
 */
function DiagnosticsSection() {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setReport(await window.sift.diagnostics.get());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const path = await window.sift.diagnostics.export();
      setSavedTo(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          data-testid="diagnostics-show"
          onClick={() => void load()}
        >
          {report ? "Refresh" : "Show what's included"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          data-testid="diagnostics-export"
          onClick={() => void save()}
        >
          Save support bundle
        </Button>
      </div>
      <p className="text-[12px] text-foreground/55">
        Excluded by design: API keys, cookies, transcript and summary text,
        media titles, and source URLs. Paths have your home folder replaced with{" "}
        <code>~</code>.
      </p>
      {savedTo && (
        <p data-testid="diagnostics-saved" className="text-[12px] text-primary">
          Saved to {savedTo}
        </p>
      )}
      {error && (
        <p data-testid="diagnostics-error" className="text-[12px] text-danger">
          {error}
        </p>
      )}
      {report && (
        <pre
          data-testid="diagnostics-preview"
          className="max-h-80 overflow-auto rounded-xl border border-white/[0.08] bg-black/30 p-3 text-[11px] leading-relaxed text-foreground/70"
        >
          {JSON.stringify(report, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function SettingsPage({ updateState }: { updateState: UpdateState }) {
  const [tab, setTab] = useState<TabId>("general");
  const [version, setVersion] = useState("…");

  // Display only — the same read-only call the Home header makes.
  useEffect(() => {
    let cancelled = false;
    window.sift.app.getVersion().then((v) => {
      if (!cancelled) setVersion(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{ backgroundImage: WARM_WASH }}
      />
      {/* THE FRAME. `min-h-0 flex-1` against the app's flex-col pane makes this box exactly
        one viewport tall and stops the pane scrolling at all, so the two flanking columns are
        stretched flex items that reach the window edge by construction. No sticky, no
        `100vh` arithmetic, nothing to jump or detach when the centre hits its scroll end —
        the same fixed-frame idiom Queue and Channels already use. */}
      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-6 overflow-hidden px-7 lg:flex-row xl:pr-0">
        {/* Section nav. One top-anchored stack: the tab card, then the index of the open tab
          directly beneath it. Both are navigation, so they belong in the same stack — pinning
          the index to the column's base opened a 524px hole between them. */}
        <nav
          aria-label="Settings sections"
          className={cn(
            "relative pt-8 lg:w-[200px] lg:shrink-0 lg:overflow-y-auto lg:pb-8",
            THIN_SCROLLBAR,
          )}
        >
          <div>
            {/* ONE horizontal inset for this whole column: `px-3`, on the eyebrow, on the
              tab rows and on the index rows below. The eyebrow carried `px-2` while the tab
              buttons carried `px-3`, so the label that heads the list sat 4px left of the
              icons it heads — and the index card 230px below resolved the same relationship
              at 8px. Matching the label to the item padding (rather than nudging it halfway)
              is what puts SECTIONS, the four tab icons, ON THIS PAGE and the ordinals on one
              left edge. */}
            <div className={cn(SECTION_SURFACE, "p-3")}>
              <CardEyebrow className="px-3 pb-2.5 pt-1">SECTIONS</CardEyebrow>
              <div className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
                {TABS.map((t) => {
                  const active = tab === t.id;
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      data-testid={`settings-tab-${t.id}`}
                      onClick={() => setTab(t.id)}
                      className={cn(
                        // inline-flex, not flex-1: a 2-character label gets a 2-character segment.
                        "relative inline-flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 lg:w-full",
                        "text-sm font-medium transition-colors duration-150 ease-out",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                        active
                          ? "text-[hsl(24_95%_70%)]"
                          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="settings-tab-pill"
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 32,
                          }}
                          className="pointer-events-none absolute inset-0 rounded-xl border border-[hsl(24_70%_38%)] bg-[hsl(24_60%_14%)]"
                        />
                      )}
                      <Icon
                        aria-hidden
                        className={cn(
                          "relative h-4 w-4",
                          active
                            ? "text-[hsl(24_95%_70%)]"
                            : "text-foreground/40",
                        )}
                      />
                      <span className="relative">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* An index of what the open tab actually contains — 24px below the tab card, in
              the SAME card shell with the SAME interior padding, not a bare block behind a
              hairline. As an un-carded div its eyebrow started 21px left of the identical
              eyebrow above it: two instances of one component, 230px apart in a 200px column,
              on two different left edges. */}
            <div className={cn(SECTION_SURFACE, "mt-6 hidden p-3 lg:block")}>
              <CardEyebrow className="px-3 pb-2.5 pt-1">
                On this page
              </CardEyebrow>
              <ul className="space-y-1.5 pb-1">
                {TAB_INDEX[tab].map((title, i) => (
                  <li
                    key={title}
                    className="flex gap-2 px-3 text-[11px] leading-4 text-fg-subtle"
                  >
                    {/* Both rungs are fg-subtle (4.6:1). Earlier passes hand-picked
                        foreground/25 (~2.3:1) then #77726F (3.78:1) here; both failed AA at
                        11px. fg-subtle is the token designated for ordinals — use it. */}
                    <span className="font-mono tabular-nums text-fg-subtle">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate">{title}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </nav>

        {/* THE scroller. Everything else on the page is a fixed surface.
          `scrollbar-gutter: stable` reserves exactly the 6px thumb and nothing more, so the
          thumb landed hard against every card's 1px hairline and the two read as one thick,
          two-tone border that came and went with scroll position. `pr-3` is the gutter: 12px
          of air between the card edge and the bar. */}
        <div
          className={cn(
            "min-w-0 max-w-[900px] flex-1 overflow-y-auto pb-14 pr-3 pt-8 [scrollbar-gutter:stable]",
            THIN_SCROLLBAR,
          )}
        >
          <header className={cn(HERO_SURFACE, "p-6")}>
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0 max-w-[32rem]">
                {/* Cog is the page's own mark and stays put across tabs: the tab's nav icon
                  here would land a second identical 14px glyph 140px above the card that
                  already wears it (Captions on Transcription, Sparkles on AI). The words
                  carry the state; the glyph carries the page. */}
                <EyebrowRow icon={Cog}>{HERO[tab].eyebrow}</EyebrowRow>
                <h1 className="mt-2.5 text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
                  {HERO[tab].title}
                </h1>
                {/* "…stays on this machine" is already the LOCAL BY DEFAULT rail card; saying
                  it a second time here and a third in a footer was the same sentence three
                  times on one screen. This keeps the functional half only. */}
                <p className="mt-2.5 max-w-[62ch] text-sm leading-relaxed text-foreground/60 [text-wrap:pretty]">
                  {HERO[tab].sub}
                </p>
              </div>
              {/* The one version string on the page. It is the least useful fact here, so it
                gets one dim line on the hero's top edge, not the bordered, 24px-padded box it
                used to have. */}
              <p className="hidden shrink-0 pt-px text-[11px] leading-4 tabular-nums text-fg-subtle sm:block">
                Build v{version}
              </p>
            </div>
          </header>

          <div className="mt-5 flex flex-col gap-5">
            {tab === "general" && (
              <>
                <SettingsSection
                  icon={FolderOpen}
                  eyebrow="STORAGE"
                  title="Downloads"
                  description="Where downloaded videos are saved."
                >
                  <DownloadsSection />
                </SettingsSection>
                {/* No CountTag on this H2. It carried the tested count (10) while the nested
                  block 130px below carried the live extractor count (4) — one pill shape, one
                  hue, one size, two numbers and no legend, and after the tested cloud was
                  merged into the extractor cloud the 10 counted nothing that was on screen.
                  One card, one count, and it counts what is rendered beneath it; the tested
                  figure is prose in the description, where it can say what it means. */}
                <SettingsSection
                  icon={FolderSearch}
                  eyebrow="AUTOMATION"
                  title="Watch folders"
                  description="Import media dropped into a folder, without picking it each time."
                >
                  <WatchFoldersSection />
                </SettingsSection>
                <SettingsSection
                  icon={Globe}
                  eyebrow="SOURCES"
                  title="Platforms"
                  description={`The ${TESTED_PLATFORM_COUNT} platforms ${branding.appName} is tested against, plus everything else yt-dlp can reach.`}
                >
                  <PlatformsSection />
                </SettingsSection>
                <SettingsSection
                  icon={KeyRound}
                  eyebrow="SESSIONS"
                  title="Sign-in browser"
                  description={
                    <>
                      Open a browser the app controls, sign into any site
                      (YouTube, Vimeo, &hellip;), and its session is used for
                      downloads and transcripts &mdash; fixing &ldquo;confirm
                      you&apos;re not a bot&rdquo;. Your credentials go straight
                      to the site.
                    </>
                  }
                >
                  <SigninSection />
                </SettingsSection>
              </>
            )}

            {tab === "transcription" && (
              <>
                {/* SOURCE, not TRANSCRIPTION: the hero above it now says TRANSCRIPTION, and a
                  card eyebrow that repeats the page eyebrow 140px above it is a label with
                  nothing to say. This one names what the card actually chooses — where a
                  transcript comes from, captions or Whisper. The description opened "How
                  transcripts are…" too, the same three words the 32px H1 now opens with. */}
                <SettingsSection
                  icon={Captions}
                  eyebrow="SOURCE"
                  title="Transcript method"
                  description="Which source a new video's transcript comes from by default."
                >
                  <TranscriptMethodSection />
                </SettingsSection>
                <SettingsSection
                  icon={Zap}
                  eyebrow="AUTOMATION"
                  title="After a download"
                  description="What runs on its own once a video finishes downloading."
                >
                  <AutoTranscriptSection />
                </SettingsSection>
                <SettingsSection
                  icon={Languages}
                  eyebrow="LANGUAGES"
                  title="Transcript language"
                  description="Preferred transcript languages. The first is the default; a transcript is fetched in the video's own language when available, otherwise the first of these that exists."
                >
                  <TranscriptLanguageSection />
                </SettingsSection>
                <SettingsSection
                  icon={Mic}
                  eyebrow="LOCAL MODEL"
                  title="Whisper (local transcription)"
                  description="Speech-to-text that runs on this machine, for videos that have no captions."
                >
                  <WhisperSection />
                </SettingsSection>
                <SettingsSection
                  icon={Languages}
                  eyebrow="LANGUAGES"
                  title="Models and languages"
                  description="Which Whisper model transcribes, in which language, and the language slide OCR reads."
                >
                  <LanguagesSection />
                </SettingsSection>
              </>
            )}

            {tab === "ai" && (
              <>
                {/* MODELS, not PROVIDERS — the hero owns PROVIDERS on this tab. This card is
                  where the default model is picked and where its key is kept. */}
                <SettingsSection
                  icon={Sparkles}
                  eyebrow="MODELS"
                  title="AI providers"
                  description="Bring your own keys. Each one is encrypted at rest by the OS keystore and never leaves this machine."
                >
                  <AiProvidersSection />
                </SettingsSection>
                <SettingsSection
                  icon={MessageSquareText}
                  eyebrow="PROMPT LIBRARY"
                  title="Prompts"
                  description="Named instructions you can run over a transcript. Built-ins ship with the app; your own can be edited, imported and exported."
                >
                  <PromptsSection />
                </SettingsSection>
                <SettingsSection
                  icon={FlaskConical}
                  eyebrow="SANDBOX"
                  title="Prompt playground"
                  description="Paste a transcript, tweak the prompt, and run it through a provider — for tuning the document distillation prompt. Nothing is saved."
                >
                  <PromptPlaygroundSection />
                </SettingsSection>
              </>
            )}

            {tab === "system" && (
              <>
                {/* DEPENDENCIES, not TOOLCHAIN — the hero owns TOOLCHAIN on this tab and also
                  names the three tools, so the description drops the list it was repeating
                  150px below and keeps only the fact nothing else on the page states. */}
                <SettingsSection
                  icon={Terminal}
                  eyebrow="DEPENDENCIES"
                  title="Binaries"
                  description="Fetched on demand and checked against the release's own sha256 before they're used."
                >
                  <BinariesSection />
                </SettingsSection>
                <SettingsSection
                  icon={RefreshCw}
                  eyebrow="RELEASES"
                  title="Updates"
                  description={`Check for a new version of ${branding.appName}.`}
                >
                  <UpdatesSection updateState={updateState} />
                </SettingsSection>
                <SettingsSection
                  icon={HardDrive}
                  eyebrow="DISK"
                  title="Storage"
                  description="What is using space, and what can be cleared without losing anything."
                >
                  <StorageSection />
                </SettingsSection>
                <SettingsSection
                  icon={Archive}
                  eyebrow="SAFETY"
                  title="Backup and repair"
                  description="Copy the library somewhere safe, restore it, or find media the library has lost track of."
                >
                  <BackupSection />
                </SettingsSection>
                <SettingsSection
                  icon={PackageOpen}
                  eyebrow="PORTABILITY"
                  title="Settings profile"
                  description="Move your setup to another machine, or restore it after a reinstall."
                >
                  <ProfileSection />
                </SettingsSection>
                <SettingsSection
                  icon={Network}
                  eyebrow="CONNECTION"
                  title="Proxy"
                  description="Route downloads and remote AI calls through a proxy on your network."
                >
                  <NetworkSection />
                </SettingsSection>
                <SettingsSection
                  icon={LifeBuoy}
                  eyebrow="SUPPORT"
                  title="Diagnostics"
                  description="A snapshot of this install to attach to a bug report. Nothing is sent anywhere — you save the file and decide what to do with it."
                >
                  <DiagnosticsSection />
                </SettingsSection>
              </>
            )}
          </div>
          {/* No footer line. "Everything stays on this machine" was already the hero subcopy
            and the LOCAL BY DEFAULT rail card — three printings of one sentence. */}
        </div>

        {/* Summary rail. A defined REGION — its own tinted lane with a left edge, running the
          full height of the window because it is a stretched item of the fixed frame. One
          top-anchored stack, same 20px rhythm as the centre column. */}
        <aside className="relative hidden w-[312px] shrink-0 overflow-y-auto border-l border-white/[0.06] bg-white/[0.02] px-6 py-8 xl:block">
          <div className="flex flex-col gap-5">
            <div className={cn(SECTION_SURFACE, "p-4")}>
              <EyebrowRow icon={Laptop}>Local by default</EyebrowRow>
              <ul className={cn(NESTED_SURFACE, "mt-3 px-3.5", ROW_LIST)}>
                {LOCALITY.map((row) => (
                  <li
                    key={row.what}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="text-[12px] text-foreground/55">
                      {row.what}
                    </span>
                    <span className="text-[12px] font-medium text-foreground/85">
                      {row.where}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={cn(SECTION_SURFACE, "p-4")}>
              <EyebrowRow icon={Check}>No save button</EyebrowRow>
              <p className="mt-2.5 text-[12px] leading-relaxed text-foreground/60 [text-wrap:pretty]">
                Every change on this page is written the moment you make it.
              </p>
            </div>

            {/* This card used to print the Binaries card's own description back at it — the
              same 26 words, ~350px apart on the tab it is most relevant to, differing only in
              "—" vs "are". A rail card exists to state what no card in the centre column
              states, so it now carries where the tools land and what the installer does NOT
              contain; verification stays on the Binaries card, said once. */}
            <div className={cn(SECTION_SURFACE, "p-4")}>
              <EyebrowRow icon={Package}>Nothing bundled</EyebrowRow>
              <p className="mt-2.5 text-[12px] leading-relaxed text-foreground/60 [text-wrap:pretty]">
                No tools ship inside the installer. They land in your app-data
                folder and can be deleted any time.
              </p>
            </div>

            {/* The page's one status vocabulary, spelled out. It continues the same stack at
              the same gap — pinning it to the base of the lane left a 310px hole above it —
              and in the same card shell as the three above it: as a bare `border-t` block its
              eyebrow sat 17px left of its siblings' and was the only one in the lane with no
              glyph, so the rail's last entry lost both the card and the identity strip. */}
            <div className={cn(SECTION_SURFACE, "p-4")}>
              <EyebrowRow icon={Activity}>Status key</EyebrowRow>
              {/* Explanatory copy in a rail card is `text-[12px] leading-relaxed
                text-foreground/60` — the exact string the two cards directly above use. These
                two rows were 11px/leading-4: one role, one lane, all four cards on screen at
                once, and two type specs. 11px is reserved for the index ordinals and the
                build string, which are a different role. */}
              <ul className="mt-2.5 flex flex-col gap-2">
                <li className="flex items-center gap-2.5">
                  <StatusDot tone="ok" label="Active" />
                  <span className="text-[12px] leading-relaxed text-foreground/60">
                    Ready to use
                  </span>
                </li>
                <li className="flex items-center gap-2.5">
                  <StatusDot tone="warn" label="Expired" />
                  <span className="text-[12px] leading-relaxed text-foreground/60">
                    Needs attention
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
