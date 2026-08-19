import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronDown,
  Download,
  FileText,
  Film,
  ScrollText,
  Sparkles,
  Tag,
  TriangleAlert,
  User,
} from "lucide-react";
import type {
  AiProviderInfo,
  DownloadOption,
  DownloadProgress,
  MediaListItem,
  MediaMetadata,
  PromptInfo,
  TranscriptRecord,
} from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CHIP_SHELL, ChipDot, TagChip } from "@/components/tag-chip";
import { cn, videoThumbUrl } from "@/lib/utils";

/* ------------------------------------------------------------------------------------------
   Home-route surface vocabulary. **Three planes, and only three**, shared verbatim by
   preview-card, transcript-panel and summary-panel so the whole column reads as one system:

     level 0  canvas   hsl(var(--background))    the atmospheric page ground (.app-canvas)
     level 1  card     hsl(var(--surface))       the foreground plane — `.panel` / `.panel-lit`
     level 2  recess   #131010 / #0C0A09         everything *inside* a card that isn't a card

   **Level 1 is not defined here, and must never be redefined here.** It used to be: a literal
   `bg-[#1C1817]` fill plus a hand-rolled `before:h-px` top line. That put this route's cards
   4 RGB points off every `.panel` card in the app — including the Saved-to-Library row 10px
   below the preview card, in the same column at the same nesting level — and drew a flat
   full-width line where the ladder draws a masked radial rim that falls off toward the
   corners. Three sibling cards ended up with 1px, 2px and 3px top edges at three different
   luminances, one of them lit from a direction the others weren't. The card object lives in
   globals.css and is reached through <Card>/<CardLit>; the two constants below add nothing to
   it but the clip that keeps nested bands inside its radius.

   Level 2 comes in two depths so a nested band and the reading well inside it are still
   distinguishable: BAND_RECESSED for a section within a card, WELL for content wells
   (thumbnail slate, spec strip, transcript/summary reading area). Interactive controls sit
   on white-alpha — they come *forward* out of the recess, the way a key sits above a deck.

   The one rule that keeps the ramp legible: a nested section is never the same value as the
   card that holds it, and a card is never the same value as the canvas.
   ------------------------------------------------------------------------------------------ */

/**
 * **Level 1 — the card plane, borrowed rather than redrawn.** `.panel` supplies the opaque
 * `--surface` fill, the 16px radius and the one masked radial rim; `overflow-hidden` is all
 * this route adds, so the recessed bands clip to that radius.
 */
export const RAISED_CARD = "panel overflow-hidden";

/**
 * Level 1, **lit**: the identical object one rung up — warm rim, faint warm outer glow —
 * reached through <CardLit>. Reserved for the card whose arrival *is* the state change (the
 * transcript panel), and stateful, like every lit surface in the app: exactly one per render.
 */
export const RAISED_CARD_LIT = "panel-lit overflow-hidden";

/**
 * **Level 2 — a recessed band inside a card.** Darker than the plane it sits in, with a
 * hard dark line under the divider and a soft inner shadow falling from it: the section is
 * pressed *into* the card, never floated on top of it. This is what makes a nested section
 * impossible to mistake for a top-level card.
 */
export const BAND_RECESSED = [
  "border-t border-foreground/[0.07] bg-[#131010]",
  "shadow-[inset_0_1px_0_0_hsl(0_0%_0%/0.55),inset_0_10px_20px_-16px_hsl(0_0%_0%/0.95)]",
].join(" ");

/**
 * **Level 2, deepest — a content well.** The reading area, the spec strip, the thumbnail
 * slate. Same fill everywhere so a well is recognisable at a glance, and dark enough that
 * the bottom fade overlays (see transcript/summary panels) can match it exactly.
 */
export const WELL_FILL = "#0C0A09";
export const WELL = [
  "rounded-xl border border-foreground/[0.07] bg-[#0C0A09]",
  "shadow-[inset_0_1px_2px_0_hsl(0_0%_0%/0.55)]",
].join(" ");

/**
 * **Is this scroller actually scrolled?** Attach the returned `ref` to a scrolling well and
 * gate its bottom fade on `overflows`.
 *
 * The fade exists to say "there is more below". Painted unconditionally it said it even when
 * there wasn't: a two-segment transcript ends *inside* the gradient's reach, so the last line
 * of a well with 18px of empty space under it was dimmed to 4.06:1 on the well fill while the
 * line above it sat at 11.6:1 — body text pushed under the contrast floor to signal content
 * that doesn't exist. Measurement only: it reads `scrollHeight`/`clientHeight` whenever the
 * well or its content changes size, and changes nothing about what the well does or contains.
 */
export function useVerticalOverflow<T extends HTMLElement>() {
  const [overflows, setOverflows] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);

  // A **callback ref**, so the measurement is wired up by the DOM node arriving rather than
  // by a render happening. The well is not always mounted — the summary panel returns `null`
  // until the first token lands — and a mount-time `useEffect` would have run once, against a
  // ref that was still null, and never looked again.
  //
  // One observer, watching both boxes that can move the answer:
  //
  //   • the scroller itself — a `max-h` well tracks its content exactly until it is full, so
  //     every growth *below* the cap, every shrink back under it, and every window resize
  //     that re-wraps the text resizes this box;
  //   • its content child — once the well is capped its own box stops moving, and only the
  //     child keeps growing as segments mount and tokens stream in.
  //
  // By the time a parent's ref callback fires its DOM subtree is already committed, so the
  // children are there to observe. This replaces a dependency-array-free effect that
  // re-measured after *every* render of the owning panel — correct, but an exhaustive-deps
  // warning and a forced layout read on renders that could not have changed the answer.
  // `setOverflows` bails out when the value is unchanged, so a burst of streamed tokens costs
  // one state update, at the transition.
  const ref = useCallback((el: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) {
      setOverflows(false);
      return;
    }
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    observerRef.current = observer;
    measure();
  }, []);

  return { ref, overflows };
}

/**
 * **Section label — one rule, one rung, everywhere on this route.** Every section on Home,
 * whether it opens a card (PREVIEW / TRANSCRIPT / SUMMARY) or a band inside one (CAPTURE /
 * SUMMARIZE), is announced by the same `.eyebrow`: the neutral head rung, not the accent.
 * Nesting is carried by the *surface* (a band is recessed), never by re-colouring the label
 * — two treatments for one structural role is a rule nobody can infer.
 */
export const SECTION_LABEL = "eyebrow";

/**
 * A different role, so a different rung: the caps label that sits *above a value* (FORMATS /
 * CAPTIONS / ALREADY IN YOUR LIBRARY). `.eyebrow` announces a section and then recedes;
 * `.field-label` is attached to something you are about to read or operate, so globals.css
 * sets it a full step brighter (`muted-foreground`, 6.1:1 on a card and 7.2:1 on the well
 * these always sit on) at the same 11px.
 *
 * It used to hand-roll a third rung here — `text-[10px] … text-foreground/45` — which is the
 * exact call-site re-roll globals.css's micro-label docblock names and forbids: 10px caps at
 * 4.2:1 on the well fill, i.e. under the floor at the one size the palette had already
 * deleted for being unreadable. Reaching for the class instead fixes the contrast and puts
 * the label back on a rung the rest of the app shares.
 */
export const FIELD_LABEL = "field-label";

/** Uniform band padding. Every section on every Home card uses exactly this. */
export const SECTION_PAD = "px-6 py-5";

/** Full-bleed divider between bands. One rule, used everywhere, never inset. */
export const SECTION_RULE = "border-t border-foreground/[0.07]";

/**
 * Metadata pills are *information*, not disabled chrome: a readable border, a fill that is
 * a real step off the surface, and text at near-full strength. Layered onto `CHIP_SHELL` so
 * the box metrics still match every other pill in the app.
 */
export const CHIP_STRONG =
  "border-foreground/[0.14] bg-foreground/[0.08] text-foreground/90";

/**
 * Status pill: a finished, on-disk fact. Together with `CHIP_STRONG` this is the whole pill
 * vocabulary on the route — there is deliberately no amber pill. The saturated accent is
 * spent on exactly one thing per surface (the primary CTA); a platform name is a fact, not
 * an action, so tinting it amber put the loudest colour in the app on the least urgent
 * element and left the Download button competing with a label it should have outranked.
 */
export const CHIP_SUCCESS = "border-success/30 bg-success/[0.12] text-success";

/** Human-readable byte size, e.g. "339 MB"; `null`/non-finite renders "". */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/** Builds the option's dropdown label, e.g. "1080p · MP4 · ~339 MB". */
function optionLabel(o: DownloadOption): string {
  const size = formatBytes(o.approxBytes);
  return [o.label, o.detail, size ? `~${size}` : ""]
    .filter(Boolean)
    .join(" · ");
}

/** Human-readable transfer rate, e.g. "1.2 MB/s"; `null`/non-finite renders "". */
export function formatSpeed(bytesPerSec: number | null): string {
  if (bytesPerSec === null || !Number.isFinite(bytesPerSec) || bytesPerSec <= 0)
    return "";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let value = bytesPerSec;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

/** ETA in seconds as "M:SS"; `null`/non-finite renders "". */
export function formatEta(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec) || sec < 0) return "";
  const total = Math.floor(sec);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} left`;
}

/** Formats a duration in seconds as "H:MM:SS" or "M:SS"; `null`/non-finite input renders "—". */
export function formatDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec) || sec < 0) return "—";
  const total = Math.floor(sec);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

const DEFAULT_MODEL_ID = "claude-opus-5";

// Stable empty-array reference so the models-sync effect doesn't re-fire every
// render while no provider is selected yet (before `defaultProviderId` resolves).
const NO_MODELS: AiProviderInfo["models"] = [];

/**
 * **One control geometry for the whole route.** Every select and every text field is the
 * same 40px box with the same 12px radius, the same hairline and the same focus treatment —
 * two control shapes in one band is the fastest way to make a form look assembled by
 * accident. Controls sit on white-alpha so they come *forward* out of the recessed band.
 */
const CONTROL_BASE = [
  "h-10 w-full min-w-0 rounded-xl border border-foreground/[0.13] bg-foreground/[0.06]",
  "text-sm text-foreground",
  "shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.07)]",
  "transition-colors duration-150 ease-out",
  "hover:border-foreground/[0.22] hover:bg-foreground/[0.09]",
  // A single hairline ring, never a second concentric halo around the control.
  "focus:border-primary/55 focus:outline-none focus:ring-1 focus:ring-primary/40",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

/**
 * **The four `<select>`s on this route stay native, deliberately.** `FilterSelect` is the
 * app's custom listbox and it is the right control almost everywhere else, but it cannot take
 * these four, for three separate reasons — recorded here so the question doesn't get reopened
 * every round:
 *
 *  1. **It would be clipped.** `FilterSelect` renders its popup as an `absolute` child, and
 *     every Home card is `.panel overflow-hidden` (the clip is what keeps the recessed bands
 *     inside the card's 16px radius). The Summarize row sits ~40px above the card's floor, so
 *     its list would be cut to a sliver. Fixing that means portalling the popup — a change to
 *     a shared component, not to this route.
 *  2. **The e2e suite drives them as real selects.** `ollama-check.spec.ts` calls
 *     `selectOption("ollama")` on `summary-provider`, which Playwright only implements for a
 *     `<select>`, and `providers-prompts.spec.ts` reads `HTMLOptionElement.value` off its
 *     `<option>` children, which only exist in the DOM for a native list.
 *  3. **Its API is a filter, not a picker.** It takes `string | null` with a mandatory
 *     "all/none" reset row and a search box — a reset row here would be a new, meaningless
 *     state on four required fields.
 *
 * A real listbox also brings keyboard, typeahead and screen-reader behaviour for free. What
 * *was* wrong is the popup's ground: Chromium paints the open list on the select's own
 * computed background, so a translucent white fill resolved against the browser's default
 * white and put dark option rows on a pale sheet — the one light surface in a near-black app.
 *
 * So the fill is restated as the opaque value it already composites to on the recessed band
 * (white/6% over #131010 → #211E1E, hover white/9% → #282526), and the rows are pinned to
 * the same value. Closed state is pixel-identical; the open list is now one dark surface.
 */
const SELECT_CLASS = cn(
  CONTROL_BASE,
  "appearance-none pl-3.5 pr-9",
  "bg-[#211E1E] hover:bg-[#282526]",
  "[&>option]:bg-[#211E1E] [&>option]:text-foreground",
  // A native <select> hard-cuts an option label that doesn't fit its box — no ellipsis, no
  // hint that anything is missing. At the 3-of-12 column these sit in, the closed control is
  // ~121px of text width, and the two longest provider labels overflow it: PROVIDER rendered
  // "Anthropic (Claude" with the paren unclosed, and "Claude Code CLI (subscription)" is
  // longer still. Chromium honours text-overflow on the select's own rendering, so the
  // control now degrades to "Anthropic (Clau…" — visibly truncated rather than silently wrong.
  "truncate [text-overflow:ellipsis]",
);

/**
 * The tag field's placeholder is the only instruction that control ever gets, so it is set on
 * the palette's placeholder token — the same one `<Input>` gives the URL field, and 4.95:1 on
 * this control's fill. It was `foreground/40`, which composites to rgb(118,116,116) on that
 * fill: 3.56:1, the one placeholder on the route under the floor while every other one cleared
 * it. An instruction you have to read is body copy, not chrome.
 */
const TAG_INPUT_CLASS = cn(
  CONTROL_BASE,
  "pl-9 pr-3.5 placeholder:text-placeholder",
);

/**
 * Disabled primary. A greyed-out gradient reads as a colour-management error, so the
 * disabled CTA drops the hue entirely and becomes plain inert chrome.
 */
const DISABLED_PRIMARY = [
  "disabled:bg-none disabled:bg-foreground/[0.06] disabled:text-foreground/45",
  "disabled:border disabled:border-foreground/[0.08] disabled:shadow-none disabled:opacity-100",
].join(" ");

/** Wraps a native <select> so it can carry a chevron the OS one can't be styled into. */
function SelectShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative flex min-w-0 items-center", className)}>
      {children}
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 h-4 w-4 text-foreground/45"
      />
    </div>
  );
}

/**
 * One cell of the spec strip: a caps field label over a **numeral**, with a real size jump
 * between them (11px label → 20px value) so the pair reads as a stat and not as two lines of
 * a table that lost its frame. Facts only — never padded out with a value that isn't already
 * in `metadata`.
 */
function SpecCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className={FIELD_LABEL}>{label}</p>
      <p className="mt-2 truncate text-[20px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

/**
 * The same cell shape for a value that is a **state, not a number** — and set to exactly the
 * same weight. Two cells sharing one framed strip and one divider are read as a pair, so the
 * pair has to be typographically symmetrical: a 13px medium label with a dot beside a 20px
 * semibold numeral carried roughly 40% of its neighbour's optical weight and made the strip
 * look half-populated, like a stat that failed to load. The value therefore takes the numeral
 * treatment verbatim (20px/600, `leading-none`, so both value boxes are the same 20px) and
 * the hue alone — green for present, muted for absent — carries the state. Nothing is encoded
 * in colour only: the word itself ("Available" / "None") says which.
 */
function SpecStatusCell({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className={FIELD_LABEL}>{label}</p>
      <p
        className={cn(
          "mt-2 truncate text-[20px] font-semibold leading-none tracking-tight",
          // "None" is a fact, not a caption. It sits on `--fg-secondary`: one rung under the
          // numeral beside it (absence shouldn't shout as loud as a count), but still a rung
          // *above* the field label over it — on `--muted-foreground` it matched its own
          // label exactly and the cell lost the step that says which line is the value.
          ok ? "text-success" : "text-fg-secondary",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export interface PreviewCardProps {
  metadata: MediaMetadata;
  /** Existing library entry for this source URL, if any (Task 5 already-captured notice). */
  existing: MediaListItem | null;
  onDownload: (option: DownloadOption, tags: string[]) => void;
  downloading: boolean;
  progress: DownloadProgress | null;
  onTranscribe: () => void;
  transcribing: boolean;
  /** Coarse stage label (e.g. "Extracting audio…") for the in-flight transcript job;
   * `null` when not transcribing or no progress event has landed yet. */
  transcriptStageLabel?: string | null;
  onSummarize: (providerId: string, model: string, promptId: number) => void;
  summarizing: boolean;
  transcript: TranscriptRecord | null;
  /** All known providers (Task 6 static descriptor), each with its current model list. */
  providers: AiProviderInfo[];
  /** First provider with a saved key (or "ollama"); `null` if none is ready yet. */
  defaultProviderId: string | null;
  prompts: PromptInfo[];
}

export function PreviewCard({
  metadata,
  existing,
  onDownload,
  downloading,
  progress,
  onTranscribe,
  transcribing,
  transcriptStageLabel,
  onSummarize,
  summarizing,
  transcript,
  providers,
  defaultProviderId,
  prompts,
}: PreviewCardProps) {
  const options = metadata.formats;
  const [selectedId, setSelectedId] = useState<string>(options[0]?.id ?? "");
  const selected = options.find((o) => o.id === selectedId) ?? options[0];
  const doneFormats = existing
    ? existing.formats.filter((f) => f.status === "done")
    : [];
  const existingMatch = selected
    ? doneFormats.find((f) => f.id === selected.id)
    : undefined;
  const transcriptCount = existing?.transcriptCount ?? 0;
  const summaryCount = existing?.summaryCount ?? 0;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const percent =
    progress && progress.total
      ? Math.min(100, Math.round((progress.received / progress.total) * 100))
      : null;

  // Purely presentational: the capture band changes its *look* the moment a transcript
  // lands, so "downloaded" and "transcribed" are not two identical screens.
  const transcriptReady = transcript !== null && !transcribing;

  // **Exactly one coral gradient per render**, and it belongs to the step that is still live
  // — the same stateful rule the URL card follows when it steps down to `.panel` once its
  // link has resolved. A download that has run has nothing left to win: leaving it in the
  // primary fill put two identical full-strength CTAs on screen 190px apart, with the spent
  // one on top, while "Saved to Library" was confirming the job underneath.
  //
  // The library lookup behind `existingMatch` is taken once, when the URL resolves, so it
  // cannot see a download that finished in this session; this remembers the format this card
  // actually captured. Presentation only — nothing here touches the click handler, the label,
  // the disabled state or the re-download confirm, which stays gated on the format genuinely
  // being on disk. Picking a different format re-lights the CTA, because that one *is* live.
  const [capturedFormatId, setCapturedFormatId] = useState<string | null>(null);
  useEffect(() => {
    if (downloading) setCapturedFormatId(selectedId);
  }, [downloading, selectedId]);
  const downloadSpent =
    !downloading && (Boolean(existingMatch) || capturedFormatId === selectedId);

  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedPromptId, setSelectedPromptId] = useState<number | "">("");

  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [ollamaState, setOllamaState] = useState<
    "idle" | "checking" | "down" | "not-installed"
  >("idle");

  // Existing tags across the library, for autosuggest while typing.
  useEffect(() => {
    void window.sift.tags
      .listAll()
      .then((rows) => setAllTags(rows.map((r) => r.name)));
  }, []);

  const tagSuggestions = tagDraft.trim()
    ? allTags.filter(
        (n) =>
          n.toLowerCase().includes(tagDraft.trim().toLowerCase()) &&
          !tags.some((t) => t.toLowerCase() === n.toLowerCase()),
      )
    : [];

  function addTag(raw: string) {
    const t = raw.trim();
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase()))
      setTags((prev) => [...prev, t]);
  }

  function doSummarize() {
    if (selectedProviderId && selectedModel && selectedPromptId !== "") {
      onSummarize(selectedProviderId, selectedModel, selectedPromptId);
    }
  }

  async function runSummarizeChecked() {
    if (selectedProviderId !== "ollama") {
      doSummarize();
      return;
    }
    setOllamaState("checking");
    if (await window.sift.ollama.health()) {
      setOllamaState("idle");
      doSummarize();
    } else {
      setOllamaState("down");
    }
  }

  async function handleStartOllama() {
    const r = await window.sift.ollama.start();
    if (r.reason === "not-installed") {
      setOllamaState("not-installed");
      return;
    }
    await new Promise((res) => setTimeout(res, 1500));
    if (await window.sift.ollama.health()) {
      setOllamaState("idle");
      doSummarize();
    } else {
      setOllamaState("down");
    }
  }

  async function handleRecheckOllama() {
    if (await window.sift.ollama.health()) {
      setOllamaState("idle");
      doSummarize();
    } else {
      setOllamaState("down");
    }
  }

  const models =
    providers.find((p) => p.id === selectedProviderId)?.models ?? NO_MODELS;
  const noProviderReady = defaultProviderId === null;

  // Pick the default provider once it resolves; keep the current pick if still valid.
  useEffect(() => {
    if (!defaultProviderId) return;
    setSelectedProviderId((prev) =>
      prev && providers.some((p) => p.id === prev) ? prev : defaultProviderId,
    );
  }, [defaultProviderId, providers]);

  // Sync defaults once options arrive; keeps the current pick if it's still valid.
  useEffect(() => {
    if (models.length === 0) {
      setSelectedModel("");
      return;
    }
    setSelectedModel((prev) =>
      prev && models.some((m) => m.id === prev)
        ? prev
        : (models.find((m) => m.id === DEFAULT_MODEL_ID)?.id ?? models[0]!.id),
    );
  }, [models]);

  useEffect(() => {
    if (prompts.length === 0) return;
    setSelectedPromptId((prev) =>
      prev !== "" && prompts.some((p) => p.id === prev) ? prev : prompts[0]!.id,
    );
  }, [prompts]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="w-full"
    >
      {/* One card (level 1), three bands: what it is → capture it → summarize it. Band 1 sits
          on the card plane; bands 2 and 3 are pressed into it (level 2). */}
      <Card data-testid="preview-card" className={RAISED_CARD}>
        <div
          className={cn(
            SECTION_PAD,
            "grid items-stretch gap-5 sm:grid-cols-[272px_minmax(0,1fr)]",
          )}
        >
          {/* Thumbnail-forward. The slate is a well (level 2) at the *well's own* fill — no
              second value — so a thumb that 404s (the img hides itself on error) degrades to a
              finished, labelled frame rather than to something that reads as a failed image
              load. It carried a `bg-[#141110]` override, which put two wells 40px apart in one
              visual row at rgb(20,17,16) and rgb(12,10,9): the empty frame read as a lighter
              panel instead of the same recess as the spec strip beside it. What distinguishes
              an empty slot from a filled one is the extra inset edge below, not a second fill.

              From `sm` up the frame *stretches*: the two columns are one block, so they have
              to terminate on the same baseline. A fixed 16:9 box is a definite height, which
              opts the column out of stretch and leaves the thumbnail ending ~8px short of the
              spec strip beside it. The outer box carries the stretch (its content is absolute,
              so it contributes no intrinsic height and the row is sized by the right column);
              `min-h` keeps it from ever collapsing below the 16:9 it starts from. */}
          <div className="relative aspect-video w-full shrink-0 sm:aspect-auto sm:h-full sm:min-h-[9.5rem]">
            <div className={cn(WELL, "absolute inset-0 overflow-hidden")}>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-foreground/[0.07]"
              />
              {/* A frame with no thumbnail is a *designed empty slot*, and it has to say so.
                  It used to be a lone dim glyph on a warm coral corner wash — a gradient that
                  matched no other surface on this card (everything else here is opaque and
                  flat), which is exactly the look of a picture that half-loaded. Now: the
                  route's one well fill, a glyph at readable strength, and a caption naming the
                  condition, so the slot states its state instead of implying a fault.
                  `aria-hidden` because the card already carries the title and platform;
                  a missing image is not information a screen reader needs announced. */}
              <span
                aria-hidden
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-foreground/40"
              >
                <Film className="h-7 w-7" strokeWidth={1.5} />
                {/* Both halves at the strength the comment above claims: the glyph clears the
                    3:1 non-text floor (it was 2.09:1 on this fill) and the caption — the half
                    that actually says what the slot is — clears 4.5:1 on `--fg-subtle`. */}
                <span className="text-[12px] font-medium leading-none text-fg-subtle">
                  No thumbnail
                </span>
              </span>
              {metadata.thumbnailUrl && (
                <img
                  src={videoThumbUrl(metadata.thumbnailUrl)}
                  alt={metadata.title}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                  className="relative h-full w-full object-cover"
                />
              )}
              {/* Duration lives on the frame, where a runtime belongs — and it lives there
                  *only*. It used to be printed a second time as a LENGTH stat 60px to the
                  right; one fact, two prints, one viewport. */}
              <span className="absolute bottom-2 right-2 rounded-md border border-foreground/[0.15] bg-black/70 px-1.5 py-0.5 text-[11px] font-medium leading-4 tabular-nums text-foreground/95 backdrop-blur-sm">
                {formatDuration(metadata.durationSec)}
              </span>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-[20px] items-center justify-between gap-3">
              {/* The card's section label — the same eyebrow rung every section uses. */}
              <p className={SECTION_LABEL}>PREVIEW</p>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                {/* Neutral, like every other pill on this route. The platform is a fact about
                    the source, not an action — and it is the only thing on this card that
                    used to wear the CTA's colour. */}
                <span
                  data-testid="preview-platform"
                  className={cn(CHIP_SHELL, CHIP_STRONG, "font-semibold")}
                >
                  {metadata.platform.label}
                </span>
                {/* Tier comes from the core platform registry. Skipped for "unknown", where the
                    platform chip beside it already says as much — a pill must add information. */}
                {metadata.platform.tier !== "unknown" && (
                  <span className={cn(CHIP_SHELL, CHIP_STRONG)}>
                    {metadata.platform.tier === "tested" && (
                      <ChipDot
                        color="hsl(var(--success))"
                        halo="hsl(var(--success) / 0.22)"
                      />
                    )}
                    {metadata.platform.tier === "tested"
                      ? "Tested"
                      : "Supported"}
                  </span>
                )}
              </div>
            </div>

            {/* The subject of the whole screen, and sized like it. At 18px it sat one step off
                the format picker and the spec values, so the video read as no more important
                than "720p · MP4". 22px against a 13px byline and a 10px field label is the
                mid-tier the ramp was missing between the 32px wordmark and body copy. */}
            <CardTitle
              data-testid="preview-title"
              className="mt-2.5 line-clamp-2 text-[22px] leading-[1.2] tracking-[-0.011em] text-foreground"
            >
              {metadata.title}
            </CardTitle>

            {metadata.uploader && (
              <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
                <User
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 text-foreground/35"
                />
                <span className="truncate">{metadata.uploader}</span>
              </p>
            )}

            {/* Spec strip — a well (level 2) sunk into the card plane, the way the reference
                nests a ranked list inside a lit panel. Every value is already in `metadata`;
                nothing here is invented to fill a cell, and nothing here is printed twice:
                LENGTH left because the runtime is already burned into the thumbnail badge,
                which is where a duration belongs. Both cells set their value the same way —
                one framed strip with one divider is read as a pair, and a pair whose halves
                are typeset differently reads as one half that failed to load.

                The flexible spacer above it pins the strip to the foot of this column (with a
                16px floor), so the strip terminates on the same baseline as the frame beside
                it — the two columns are one block. */}
            <div aria-hidden className="min-h-4 flex-1" />
            <div
              className={cn(
                WELL,
                // A touch stronger than the default well hairline: at 7% the frame around
                // this group read as absent, and a stat strip with no container is just a
                // table row that lost its table.
                "grid grid-cols-2 divide-x divide-foreground/[0.09] overflow-hidden border-foreground/[0.10]",
              )}
            >
              <SpecCell label="Formats" value={String(options.length)} />
              <SpecStatusCell
                label="Captions"
                value={metadata.hasCaptions ? "Available" : "None"}
                ok={metadata.hasCaptions}
              />
            </div>

            {(doneFormats.length > 0 ||
              transcriptCount > 0 ||
              summaryCount > 0) && (
              <div
                data-testid="already-captured"
                className={cn(WELL, "mt-2.5 px-3.5 py-3")}
              >
                <p className={FIELD_LABEL}>Already in your library</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {doneFormats.map((f) => (
                    <span
                      key={f.id}
                      data-testid="captured-video"
                      className={cn(CHIP_SHELL, CHIP_STRONG)}
                    >
                      <ChipDot
                        color="hsl(var(--primary))"
                        halo="hsl(var(--primary) / 0.24)"
                      />
                      {f.label}
                    </span>
                  ))}
                  {transcriptCount > 0 && (
                    <span
                      data-testid="captured-transcript"
                      className={cn(CHIP_SHELL, CHIP_STRONG)}
                    >
                      <FileText
                        aria-hidden
                        className="h-3 w-3 text-foreground/55"
                      />
                      Transcript
                      {existing?.transcriptLanguage
                        ? ` · ${existing.transcriptLanguage}`
                        : ""}
                    </span>
                  )}
                  {summaryCount > 0 && (
                    <span
                      data-testid="captured-summary"
                      className={cn(CHIP_SHELL, CHIP_STRONG)}
                    >
                      <Sparkles
                        aria-hidden
                        className="h-3 w-3 text-foreground/55"
                      />
                      {summaryCount}{" "}
                      {summaryCount === 1 ? "summary" : "summaries"}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Band 2 — capture. Recessed (level 2): a section inside a card is pressed in, never
            drawn as another card. Coral is the media hue, so the download CTA is the one
            gradient in this band. */}
        <div className={cn(BAND_RECESSED, SECTION_PAD)}>
          <p className={SECTION_LABEL}>CAPTURE</p>

          {/* One 12-column grid, shared with the Summarize row below — and split on the *same*
              tracks: 6 / 3 / 3 here against 3 / 3 / 3 / 3 there, so both interior edges (col 6
              and col 9) line up down the card. Splitting 5 / 4 / 3 put the two rows on one grid
              but on different cuts of it, which is why only the right edge ever agreed.

              `items-end` sets the row's shared baseline: a labelled column is taller than a
              bare button by exactly its label block, so the *controls* are what line up, not
              the tops of the grid items. Every box in the row is then the same 40px shell the
              route's control geometry declares — the buttons take `h-10` for that reason and
              for no other. */}
          <div className="mt-3.5 grid grid-cols-1 items-end gap-2.5 sm:grid-cols-12">
            {/* A control with no name is a value with no axis: "720p · MP4 · ~339 MB" says what
                is selected and nothing about what selecting it does. `.field-label` is the rung
                globals.css defines for exactly this (its docblock names FORMAT), and the
                `aria-label` repeats it so the name survives for assistive tech, which cannot
                infer a label from proximity. */}
            <div className="min-w-0 sm:col-span-6">
              <p className={cn(FIELD_LABEL, "mb-1.5")}>FORMAT</p>
              <SelectShell>
                <select
                  data-testid="download-format"
                  aria-label="Format"
                  value={selectedId}
                  disabled={downloading}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {options.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {optionLabel(opt)}
                    </option>
                  ))}
                </select>
              </SelectShell>
            </div>
            {/* The one saturated fill on the whole route — and it stands down once it has
                nothing left to win: the selected format is already on disk, or this card has
                just captured it. The button itself then carries the state instead of shouting
                primary at a finished job while a green chip elsewhere quietly does the
                reporting, and the accent moves down to Summarize, which is now the live step.
                See `downloadSpent` above.

                **`downloadSpent` is now the whole state**, and it drives all three of the
                things that state is: the shell, the label and the click. It used to drive only
                the shell — the demotion came from `downloadSpent`, the "Re-download …" label
                and the overwrite confirm came from `existingMatch`, which is the library lookup
                taken when the URL resolved and is therefore always false for a format captured
                in this session. So a button that looked spent read the bare verb "Download",
                said nothing about the job having succeeded, and silently overwrote the file it
                had just written. One predicate, one state: a spent button names the file it
                would replace, and asks before replacing it. */}
            <Button
              data-testid="download-button"
              variant={downloadSpent ? "outline" : "default"}
              className={cn(
                "h-10 min-w-0 sm:col-span-3",
                DISABLED_PRIMARY,
                downloadSpent && "font-medium text-[13px]",
              )}
              disabled={downloading || !selected}
              onClick={() => {
                if (!selected) return;
                // This exact format is already on disk — from the library, or from this card's
                // own capture — so confirm before overwriting it.
                if (existingMatch || downloadSpent) setConfirmOpen(true);
                else onDownload(selected, tags);
              }}
            >
              {/* THE ICON IS THE FIRST THING TO GO WHEN THE LABEL GROWS.
                  This button owns 3 of the CAPTURE row's 12 columns, which at the route's own
                  `max-w-3xl` column is ~170px: enough for "Download" with its glyph and 4px short
                  of "Re-download 1080p" with it. So the spent state — the only state whose label
                  names a format — rendered "Re-download 10…", a primary control truncating its
                  own text mid-number at the width the app is designed around, with the ellipsis
                  sitting in visibly unused button. Dropping the mark in that state buys the 24px
                  the words need. Nothing is lost: `downloadSpent` already restyles the button
                  from filled to outline, so the state is carried by the shell as well as the
                  label, and the glyph is redundant beside the verb. */}
              {!downloadSpent && <Download aria-hidden className="h-4 w-4" />}
              <span className="truncate">
                {downloading
                  ? "Downloading…"
                  : downloadSpent && selected
                    ? `Re-download ${selected.label}`
                    : "Download"}
              </span>
            </Button>
            {/* This track holds a control in every state — re-fetching a transcript is still
                one click — so it is drawn as a control in every state. Stripping the border and
                fill once the transcript landed left bare green text in the third track while
                the two beside it were filled 40px boxes: a hole in the row that declared "I am
                a status, not a control" at rest and then contradicted itself by growing a
                tinted surface the instant the pointer touched it. It keeps the secondary shell
                throughout and only *re-hues* it — success border, success fill, success ink —
                so the box is filled at rest and the hover step is an honest deepening of a
                surface that was already there. */}
            <Button
              data-testid="transcript-button"
              variant="outline"
              className={cn(
                "h-10 min-w-0 sm:col-span-3",
                transcriptReady &&
                  "border-success/25 bg-success/[0.10] text-[13px] font-medium text-success hover:border-success/40 hover:bg-success/[0.16] hover:text-success",
              )}
              disabled={transcribing}
              onClick={() => onTranscribe()}
            >
              {transcriptReady ? (
                <Check aria-hidden className="h-3.5 w-3.5" />
              ) : (
                <ScrollText aria-hidden className="h-4 w-4" />
              )}
              <span className="truncate">
                {transcribing
                  ? (transcriptStageLabel ?? "Transcribing…")
                  : transcriptReady
                    ? "Transcript ready"
                    : "Get transcript"}
              </span>
            </Button>
          </div>

          <div className="mt-2.5 flex flex-col gap-2">
            {/* Same 40px box, same 12px radius as every select above it. */}
            <div className="relative flex min-w-0 items-center">
              <Tag
                aria-hidden
                className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-foreground/40"
              />
              <input
                data-testid="download-tag-input"
                value={tagDraft}
                disabled={downloading}
                placeholder="Add tags (Enter or comma)…"
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag(tagDraft);
                    setTagDraft("");
                  }
                }}
                className={TAG_INPUT_CLASS}
                list="download-tag-suggestions"
              />
            </div>
            <datalist id="download-tag-suggestions">
              {tagSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <TagChip
                    key={t}
                    name={t}
                    onRemove={() =>
                      setTags((prev) => prev.filter((x) => x !== t))
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <AnimatePresence>
            {downloading && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 flex flex-col gap-1.5">
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/40 shadow-[inset_0_1px_2px_0_hsl(0_0%_0%/0.6)]">
                    {percent !== null ? (
                      <motion.div
                        data-testid="download-progress"
                        className="h-full rounded-full bg-gradient-to-r from-primary to-primary-lit"
                        animate={{ width: `${percent}%` }}
                        transition={{ ease: "easeOut" }}
                      />
                    ) : (
                      <motion.div
                        data-testid="download-progress"
                        className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary to-primary-lit"
                        animate={{ x: ["-100%", "300%"] }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.2,
                          ease: "linear",
                        }}
                      />
                    )}
                  </div>
                  <p
                    data-testid="download-status"
                    className="flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground"
                  >
                    <span>
                      {percent !== null ? `${percent}%` : "Starting…"}
                    </span>
                    <span>
                      {[
                        formatSpeed(progress?.speed ?? null),
                        formatEta(progress?.eta ?? null),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Band 3 — summarize. Same recessed treatment, same label, same 12-col grid as
            Capture: one band is not "more AI" than another, so it gets no second hue. */}
        <div className={cn(BAND_RECESSED, SECTION_PAD)}>
          {/* The blocker rides in the label row, on the band's left rail, where it reads as a
              condition on the section. Right-aligned under the disabled button it was wider
              than the control it explained and tied to nothing — a caption hanging in space
              whose only alignment was the card's right padding.

              Both blockers sit on the **caption** token, not the tertiary/disabled one. They
              read as chrome and were typeset as chrome — `foreground/45`, 3.77:1 at 12px —
              which left the one sentence a stuck user has to read as the dimmest text on the
              route, under a body that clears 12.9:1 and a "2 timed segments" beside it at
              6.1:1. A sentence explaining why a control is dead is not chrome; it is the
              reason the screen has stopped moving, so it is set like everything else you
              are meant to read. */}
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <p className={SECTION_LABEL}>SUMMARIZE</p>
            {!transcript && (
              <span className="text-[12px] leading-none text-muted-foreground">
                Get a transcript first
              </span>
            )}
            {transcript && noProviderReady && (
              <span
                data-testid="summary-no-provider"
                className="text-[12px] leading-none text-muted-foreground"
              >
                Add an AI provider key in Settings
              </span>
            )}
          </div>

          {/* Three identical 171px boxes in a row, each printing only its current value:
              "Ollama (local)", "Llama 3.1", "Key points". Nothing named the axis any of them
              turned, and the third — a *prompt style* — was the one value that reads as a
              summary of the transcript rather than a setting. Same rung, same `aria-label`
              rule, same 6px gap as FORMAT above, so one labelled-control pattern covers both
              bands. `items-end` again: the four controls share a baseline, the labels sit
              above the three that have one. */}
          <div className="mt-3.5 grid grid-cols-1 items-end gap-2.5 sm:grid-cols-12">
            <div className="min-w-0 sm:col-span-3">
              <p className={cn(FIELD_LABEL, "mb-1.5")}>PROVIDER</p>
              <SelectShell>
                <select
                  data-testid="summary-provider"
                  aria-label="Provider"
                  value={selectedProviderId}
                  disabled={summarizing || providers.length === 0}
                  onChange={(e) => setSelectedProviderId(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </SelectShell>
            </div>
            <div className="min-w-0 sm:col-span-3">
              <p className={cn(FIELD_LABEL, "mb-1.5")}>MODEL</p>
              <SelectShell>
                <select
                  data-testid="summary-model"
                  aria-label="Model"
                  value={selectedModel}
                  disabled={summarizing || models.length === 0}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </SelectShell>
            </div>
            <div className="min-w-0 sm:col-span-3">
              <p className={cn(FIELD_LABEL, "mb-1.5")}>STYLE</p>
              <SelectShell>
                <select
                  data-testid="summary-prompt"
                  aria-label="Style"
                  value={selectedPromptId}
                  disabled={summarizing || prompts.length === 0}
                  onChange={(e) => setSelectedPromptId(Number(e.target.value))}
                  className={SELECT_CLASS}
                >
                  {prompts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </SelectShell>
            </div>
            {/* Same coral CTA as Download: one accent for the whole route. Disabled drops the
                hue entirely — a desaturated gradient reads as a rendering fault, not a state. */}
            <Button
              data-testid="summarize-button"
              className={cn("h-10 min-w-0 sm:col-span-3", DISABLED_PRIMARY)}
              disabled={
                !transcript ||
                summarizing ||
                ollamaState === "checking" ||
                selectedProviderId === "" ||
                selectedModel === "" ||
                selectedPromptId === ""
              }
              onClick={() => void runSummarizeChecked()}
            >
              <Sparkles aria-hidden className="h-4 w-4" />
              <span className="truncate">
                {summarizing ? "Summarizing…" : "Summarize"}
              </span>
            </Button>
          </div>

          {(ollamaState === "down" || ollamaState === "not-installed") && (
            <div
              data-testid="ollama-down-panel"
              className="mt-3 flex flex-col gap-2.5 rounded-xl border border-warning/25 bg-warning/12 p-3.5"
            >
              <p className="flex items-center gap-2 text-sm font-medium text-warning">
                <TriangleAlert aria-hidden className="h-4 w-4 shrink-0" />
                {ollamaState === "not-installed"
                  ? "Ollama isn't installed."
                  : "Ollama isn't running."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {ollamaState === "down" && (
                  <Button
                    size="sm"
                    data-testid="ollama-start"
                    onClick={() => void handleStartOllama()}
                  >
                    Start Ollama
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="ollama-recheck"
                  onClick={() => void handleRecheckOllama()}
                >
                  Recheck
                </Button>
                {ollamaState === "not-installed" && (
                  <button
                    type="button"
                    data-testid="ollama-install-link"
                    className="inline-flex h-9 items-center rounded-xl border border-foreground/[0.12] px-3 text-[13px] font-medium text-primary no-underline decoration-primary/30 underline-offset-4 transition-colors duration-150 ease-out hover:border-primary/35 hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    onClick={() =>
                      void window.sift.library.openExternal(
                        "https://ollama.com",
                      )
                    }
                  >
                    Get Ollama
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
      <ConfirmDialog
        open={confirmOpen}
        data-testid="redownload-confirm"
        title="Re-download this video?"
        description={
          <>
            <span className="font-medium">{selected?.label}</span> is already in
            your library
            {transcriptCount > 0 ? " (with a transcript)" : ""}. Downloading
            again will replace the existing file.
          </>
        }
        confirmLabel={
          selected ? `Re-download ${selected.label}` : "Re-download"
        }
        onConfirm={() => {
          setConfirmOpen(false);
          if (selected) onDownload(selected, tags);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </motion.div>
  );
}
