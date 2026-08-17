import type { ReactNode } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import type { MediaDetail } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { useAiPickers } from "@/lib/use-ai-pickers";
// The Files tab owns the one label+timestamp grammar for an AI run; this card renders the same
// records, so it borrows those helpers rather than re-deriving a second wording for them.
import { aiLabel, Caption } from "./files-panel";

// Native <select> kept (the e2e suite drives these with selectOption); `appearance-none` plus
// an absolutely-positioned chevron is what stops Chromium's default arrow looking pasted on.
// h-10 + rounded-xl + border-white/10 — the same shell every form field on the route wears.
const SELECT_CLASS =
  "h-10 w-full min-w-0 appearance-none rounded-xl border border-white/10 bg-white/[0.03] pl-3 pr-9 text-sm text-foreground transition-colors hover:border-white/20 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50";
// The shared micro-label rung (11px, uppercase, fg-subtle) rather than a hand-mixed 10px/45%
// grey — at that size and contrast PROVIDER / MODEL / PROMPT were barely legible.
const LABEL_CLASS = "field-label mb-1.5 block";

/** Nested surface, one step lighter than the panel around it. */
const NESTED =
  "rounded-xl border border-white/[0.07] border-t-white/[0.10] bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-5";

/** Secondary action shell, shared with the Transcript and Downloads rows — every secondary in a
 * cluster wears the same border, and the destructive one differs only on hover. */
const GHOST_BUTTON =
  "border border-white/10 bg-transparent text-muted-foreground hover:border-white/20 hover:bg-white/[0.04] hover:text-foreground";
const DANGER_GHOST_BUTTON = `${GHOST_BUTTON} hover:border-danger/30 hover:bg-danger/10 hover:text-danger`;

/** The tab's own designed floor. Same recipe as TranscriptPanel's empty state, so switching
 * tabs never trades a bounded box for a caption stranded above 200px of bare surface. */
const EMPTY_BOX =
  "flex flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-9 text-center";
const EMPTY_CHIP =
  "grid h-8 w-8 place-items-center rounded-lg bg-white/[0.05] text-foreground/50";

export interface SummariesPanelProps {
  summaries: MediaDetail["summaries"];
  transcriptsCount: number;
  pickers: ReturnType<typeof useAiPickers>;
  summarizing: boolean;
  onSummarize: () => void;
  onRemove: (id: number) => void;
}

/** Lists a media item's summaries with a labeled provider/model/prompt control to run a new one. */
export function SummariesPanel({
  summaries,
  transcriptsCount,
  pickers,
  summarizing,
  onSummarize,
  onRemove,
}: SummariesPanelProps) {
  const {
    providers,
    prompts,
    models,
    noProviderReady,
    selectedProviderId,
    setSelectedProviderId,
    selectedModel,
    setSelectedModel,
    selectedPromptId,
    setSelectedPromptId,
  } = pickers;

  const blocked = transcriptsCount === 0 || noProviderReady;
  const promptName = (id: number | null): string =>
    (id != null && prompts.find((p) => p.id === id)?.name) || "—";

  return (
    // flex-1 without min-h-0: fills the card, but the automatic minimum size keeps every
    // row at its content height, so a long results list scrolls the card instead of clipping.
    <div className="flex flex-1 flex-col gap-4">
      {/* Generate control — a nested surface one step lighter than the panel around it. */}
      <div className={`${NESTED} flex-none`}>
        {/* Two-up, with Prompt spanning: the detail column is ~420px wide, so three side-by-side
            selects truncated their own labels ("Ollama (loca…"). */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Provider">
            <select
              data-testid="media-detail-summary-provider"
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
          </Field>
          <Field label="Model">
            <select
              data-testid="media-detail-summary-model"
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
          </Field>
          <Field label="Prompt" className="col-span-2">
            <select
              data-testid="media-detail-summary-prompt"
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
          </Field>
        </div>
        {/* The one filled CTA in this panel — nothing else here carries a saturated fill. */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
          <Button
            data-testid="media-detail-summarize"
            disabled={
              transcriptsCount === 0 ||
              summarizing ||
              selectedProviderId === "" ||
              selectedModel === "" ||
              selectedPromptId === ""
            }
            onClick={onSummarize}
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            {summarizing ? "Summarizing…" : "Run prompt"}
          </Button>
          {transcriptsCount === 0 && (
            <span className="text-[13px] text-muted-foreground">
              Get a transcript first
            </span>
          )}
          {transcriptsCount > 0 && noProviderReady && (
            <span
              data-testid="media-detail-no-provider"
              className="text-[13px] text-muted-foreground"
            >
              Add an AI provider key in Settings
            </span>
          )}
        </div>
      </div>

      {/* Results. Generated text is held off in its own quoted block. Its left rule is NEUTRAL:
          coral on this surface means current-or-actionable everywhere it appears — the active nav
          tile, the tab underline, the active transcript line, the seek progress, the Run prompt
          CTA 130px above — and a decorative rule beside static prose was the one coral on the page
          carrying no meaning. The panel keeps exactly one accent, and it is the CTA. */}
      {summaries.map((s) => (
        <article
          key={s.id}
          data-testid="media-detail-summary"
          className="flex-none rounded-xl border border-white/[0.06] bg-white/[0.02] p-5"
        >
          {/* A result is titled by WHAT IT IS — the prompt that produced it — and captioned by
              what produced it, in the same two-line grammar (and the same shared `Caption`) the
              identical record wears on the Files tab. Heading it with an 11px `OLLAMA` badge put
              the engine above the answer and inverted the type ramp inside the card: 11/12px over
              14px body. Export/Remove sit on the TITLE's line, not centred across both, so the
              caption owns the card's full width and the timestamp is never the part that clips. */}
          <div className="mb-3 flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-3">
              <span className="truncate text-sm font-medium text-foreground">
                {promptName(s.promptId)}
              </span>
              <div className="ml-auto flex flex-none items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className={GHOST_BUTTON}
                  data-testid="media-detail-summary-export"
                  onClick={() => void window.sift.summarize.export(s.id)}
                >
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="media-detail-summary-remove"
                  onClick={() => onRemove(s.id)}
                  className={DANGER_GHOST_BUTTON}
                >
                  Remove
                </Button>
              </div>
            </div>
            <Caption note={aiLabel(s.providerId, s.model)} at={s.createdAt} />
          </div>
          <p className="scroll-thin max-h-96 overflow-y-auto whitespace-pre-wrap border-l-2 border-l-white/10 pl-4 text-sm leading-relaxed text-foreground/90">
            {s.text}
          </p>
        </article>
      ))}

      {/* A zero-count result set is a BOUNDED empty region, not a caption. As a one-line status
          it was left-aligned and orphaned above ~210px (~40% of the panel body) of unexplained
          surface, and read as a label for the void; the Transcript tab fills the same box, so
          the emptiness was structural to this tab alone. `flex-1` hands the results region every
          pixel the form doesn't use, giving the panel a designed floor on all four tabs. */}
      {summaries.length === 0 && (
        <div className={`${EMPTY_BOX} flex-1`}>
          <span className={EMPTY_CHIP} aria-hidden>
            <Sparkles className="h-4 w-4" />
          </span>
          <p className="text-[13px] font-semibold text-foreground">
            No prompt run yet.
          </p>
          <p className="max-w-[38ch] text-[13px] leading-relaxed text-muted-foreground">
            {blocked
              ? "Summaries appear here once a transcript and an AI provider are ready."
              : "No summaries yet — run a prompt above."}
          </p>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className={LABEL_CLASS}>{label}</label>
      <div className="relative">
        {children}
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40"
        />
      </div>
    </div>
  );
}
