import type { ReactNode } from "react";
import { Captions, FileText, FolderOpen, Sparkles } from "lucide-react";
import type { DocumentRecord, PromptInfo, SummaryRecord, TranscriptRecord } from "@sift/ipc-contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KNOWN_PROVIDERS } from "@/lib/ai-provider-catalog";
import { transcriptProviderLabel } from "@/lib/transcript-provider-label";

/** One date shape for every caption on this tab — "16 Aug 2026, 4:39 PM". `toLocaleString()`
 * printed seconds (noise in a created-at line) in the only slash-delimited, unpadded format on
 * the surface. Built once at module scope: constructing an `Intl.DateTimeFormat` is the
 * expensive half, and this runs per row. */
const WHEN_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** ms epoch → short local date+time. Always rendered through `Caption` below, which is what the
 * Downloads section and the Tools tab's result card import too — the same record stamped two
 * different ways on two tabs is the bug this file spent a round fixing. */
export function when(ms: number): string {
  return WHEN_FORMAT.format(new Date(ms));
}

/** Also built once. Absent in exotic runtimes, hence the guard — the row then falls back to the
 * raw code rather than throwing inside render. */
const LANGUAGE_NAMES = (() => {
  try {
    return new Intl.DisplayNames(undefined, { type: "language" });
  } catch {
    return null;
  }
})();

/** "en" → "English": the transcript row's title is the thing a reader recognises, not the slug
 * of the provider that fetched it. Exported because the Transcript tab lists the *same records*
 * — it named them "EN" while this tab named them "English", which is the same record wearing two
 * vocabularies one tab apart. */
export function languageName(code: string | null): string {
  if (!code) return "Transcript";
  try {
    return LANGUAGE_NAMES?.of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** Drops the qualifier a picker label carries for disambiguation ("Ollama (local)" →
 * "Ollama"): inside a caption the parenthetical is noise, and the base name is the half the
 * user recognises from the select. */
function baseName(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** `("ollama", "llama3.1")` → `"Ollama · Llama 3.1"`.
 *
 * Provider and model ids are internal keys, never copy. One engine was reaching the surface
 * under three names inside a 430px column — "Ollama (local)" in the picker, "OLLAMA" on the
 * result card, `ollama · llama3.1` in these captions — so every site now resolves through the
 * same catalog the pickers are built from. An id absent from the catalog (a provider registered
 * outside the curated mirror) falls back to the raw value rather than to nothing. */
export function aiLabel(providerId: string | null, model: string | null): string {
  if (!providerId) return "No AI (raw)";
  const provider = KNOWN_PROVIDERS.find((p) => p.id === providerId);
  const name = provider ? baseName(provider.label) : providerId;
  const modelName = provider?.models.find((m) => m.id === model)?.label;
  const shown = modelName ? baseName(modelName) : (model ?? "");
  return shown ? `${name} · ${shown}` : name;
}

/** **The row geometry, in one place.** Padding, gap and the 32px leading chip are exported
 * because the Downloads section — its own file, but one section among these four — renders the
 * same row; hand-rolling it twice is what let the two lists drift into different leading
 * rhythms. Everything that lands in a Files section now starts its text on one x.
 *
 * Box and tone are separate constants because a failed download swaps the row to the danger hue,
 * and it must not have to restate the geometry to do it. */
export const ROW_BOX = "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors";
export const ROW_SURFACE =
  "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]";
export const ROW_SHELL = `${ROW_BOX} ${ROW_SURFACE}`;
export const ROW_CHIP_BOX =
  "grid h-8 w-8 flex-none place-items-center rounded-lg [&_svg]:h-3.5 [&_svg]:w-3.5";
export const ROW_CHIP = `${ROW_CHIP_BOX} bg-white/[0.05] text-foreground/50`;

/** A zero-count section is a single status line, not a 110px card with a centred icon: four of
 * those stacked put the tab's own content below the fold.
 *
 * It carries the **same** padding, gap and 32px chip as a filled row, because an empty section
 * with a bare glyph started its text 22px to the left of every filled row's title — so the
 * column's ink edge stepped in and out as you scrolled past sections that happened to have no
 * content. What separates it from a filled row is weight, not geometry: one line instead of two,
 * 12.5px muted prose instead of a 14px/500 name, and a quieter hairline, fill and chip. (Not a
 * dashed outline — on this surface a dashed border is the file drop-zone's mark, and every empty
 * state on the detail route deliberately avoids borrowing it.) */
export const EMPTY_ROW =
  "flex h-12 items-center gap-3 rounded-xl border border-white/[0.045] bg-white/[0.012] px-3.5";
export const EMPTY_CHIP =
  "grid h-8 w-8 flex-none place-items-center rounded-lg bg-white/[0.035] text-fg-subtle [&_svg]:h-3.5 [&_svg]:w-3.5";

const GHOST_BUTTON =
  "border border-white/10 bg-transparent text-muted-foreground hover:border-white/20 hover:bg-white/[0.04] hover:text-foreground";

/** **Counts come from the shared pill primitive** (`Badge variant="count"`), not from a local
 * geometry: the tab strip, every Files section head and the Downloads head render the same box,
 * so the same "2" can't arrive as one chip here and a different one there. These two modifiers
 * change *ink only* — a zero is one step quieter, the selected tab one step brighter. All three
 * stay neutral: a count is not a claim, and the selected tab already has its underline. */
export const COUNT_ZERO = "bg-foreground/[0.05] text-fg-subtle";
export const COUNT_ACTIVE = "bg-foreground/[0.16] text-foreground";

export interface FilesPanelProps {
  documents: DocumentRecord[];
  transcripts: TranscriptRecord[];
  summaries: SummaryRecord[];
  prompts: PromptInfo[];
  onReveal: (path: string) => void;
  onOpenTab: (tab: "transcript" | "summary") => void;
}

/** The "everything created for this video" hub: generated documents, and the transcripts and
 * summaries that exist. Downloads are listed separately.
 *
 * **Every artifact appears exactly once.** A "Prompts run" section used to re-render each
 * summary as a second row 110px below the first — same icon, same title, same caption, a
 * different action set and a different truncation point — while the tab badge counted the
 * record once. Documents carry their tier in the row instead (Sparkles + the engine that
 * polished them, vs. a plain page and "No AI (raw)"), so the list is now the whole truth and
 * the badge (documents + transcripts + summaries + downloads) equals the rows rendered. */
export function FilesPanel({ documents, transcripts, summaries, prompts, onReveal, onOpenTab }: FilesPanelProps) {
  const promptName = (id: number | null): string =>
    (id != null && prompts.find((p) => p.id === id)?.name) || "—";

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Documents"
        count={documents.length}
        empty={documents.length === 0 ? "No documents yet — build one from the Slides tab." : null}
        emptyIcon={<FileText />}
      >
        {documents.map((d) => (
          <Row
            key={d.id}
            // An AI-polished export IS the prompt run it came from — the testid stays on the row
            // that still plays that role now the duplicate section is gone.
            testid={d.providerId ? "files-prompt-run" : "files-document"}
            icon={d.providerId ? <Sparkles /> : <FileText />}
            title={d.path.split(/[\\/]/).pop() ?? d.format}
            titleAttr={d.path}
            badges={<Badge variant="code" className="flex-none">{d.format}</Badge>}
            caption={<Caption note={aiLabel(d.providerId, d.model)} at={d.createdAt} />}
            actions={
              <Button size="sm" variant="ghost" className={GHOST_BUTTON} onClick={() => onReveal(d.path)}>
                <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                Open
              </Button>
            }
          />
        ))}
      </Section>

      <Section
        title="Transcripts"
        count={transcripts.length}
        empty={transcripts.length === 0 ? "No transcripts yet." : null}
        emptyIcon={<Captions />}
      >
        {/* Title = the language, marker = where it came from. Both tabs now name the source with
            the same word in the same chip; the row's headline is the one thing here that is
            prose, so the raw `ytdlp-subs` slug never surfaces as copy. */}
        {transcripts.map((t) => (
          <Row
            key={t.id}
            testid="files-transcript"
            icon={<Captions />}
            title={languageName(t.language)}
            badges={<Badge variant="code" className="flex-none">{transcriptProviderLabel(t.providerId)}</Badge>}
            caption={<Caption at={t.createdAt} />}
            actions={
              <>
                {t.filePath && (
                  <Button size="sm" variant="ghost" className={GHOST_BUTTON} onClick={() => onReveal(t.filePath!)}>
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                    Open
                  </Button>
                )}
                <Button size="sm" variant="ghost" className={GHOST_BUTTON} onClick={() => onOpenTab("transcript")}>
                  Go to
                </Button>
              </>
            }
          />
        ))}
      </Section>

      <Section
        title="Summaries"
        count={summaries.length}
        empty={summaries.length === 0 ? "No summaries yet." : null}
        emptyIcon={<Sparkles />}
      >
        {summaries.map((s) => (
          <Row
            key={s.id}
            testid="files-summary"
            icon={<Sparkles />}
            title={promptName(s.promptId)}
            caption={<Caption note={aiLabel(s.providerId, s.model)} at={s.createdAt} />}
            actions={
              <>
                {s.filePath && (
                  <Button size="sm" variant="ghost" className={GHOST_BUTTON} onClick={() => onReveal(s.filePath!)}>
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                    Open
                  </Button>
                )}
                <Button size="sm" variant="ghost" className={GHOST_BUTTON} onClick={() => onOpenTab("summary")}>
                  Go to
                </Button>
              </>
            }
          />
        ))}
      </Section>
    </div>
  );
}

/** Small-caps section label, its count in the route's one count pill, then a hairline running
 * out to the edge. The count sits *next to the thing it counts* — parked at the far end of the
 * rule it was an invisible 11px numeral in an encoding nothing else on the page used. */
function Section({
  title,
  count,
  empty,
  emptyIcon,
  children,
}: {
  title: string;
  count: number;
  empty: string | null;
  emptyIcon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">{title}</p>
        <Badge variant="count" className={count > 0 ? "flex-none" : `flex-none ${COUNT_ZERO}`}>
          {count}
        </Badge>
        <span className="h-px flex-1 bg-white/[0.06]" aria-hidden />
      </div>
      {empty ? (
        <div className={EMPTY_ROW}>
          <span aria-hidden className={EMPTY_CHIP}>
            {emptyIcon}
          </span>
          <p className="min-w-0 truncate text-[12.5px] text-muted-foreground">{empty}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">{children}</div>
      )}
    </div>
  );
}

/** **One row grammar for the whole tab**: 32px chip · 14px/500 name · marker pills · actions,
 * then the caption on its own full-width line beneath. Three of the four sections used to order
 * those parts differently — a format pill led the Documents row, a `Summary` pill led the prompt
 * run, the Downloads row led with `720P` and dropped its filename to line two — so the reader
 * had no fixed column to scan names in. The name is always first, the pills always trail it.
 *
 * The actions sit on the NAME's line rather than centred across both, which is what frees the
 * caption to span the row: sharing a line with two buttons left it ~180px in a 430px column,
 * and that is the width that was cutting timestamps in half. */
function Row({
  testid,
  icon,
  title,
  titleAttr,
  badges,
  caption,
  actions,
}: {
  testid: string;
  icon: ReactNode;
  title: string;
  /** Native tooltip for a name that can outrun its column (a full path). */
  titleAttr?: string;
  badges?: ReactNode;
  caption?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div data-testid={testid} className={ROW_SHELL}>
      <span aria-hidden className={ROW_CHIP}>
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground" title={titleAttr}>
            {title}
          </span>
          {badges}
          {actions && <div className="ml-auto flex flex-none items-center gap-1.5">{actions}</div>}
        </div>
        {caption}
      </div>
    </div>
  );
}

/** The caption line: provenance truncates, **the timestamp never does**. The two shared one
 * `truncate` run whose width varied with how many buttons a row happened to carry, so one string
 * clipped at two different characters in adjacent rows and read "…Aug 16, …" — a date cut
 * mid-value carries less than no date at all. `flex-none` on the stamp makes the clip structurally
 * impossible; giving the line the full row width means nothing clips at these widths at all. */
export function Caption({ note, at }: { note?: string; at: number }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5 text-xs text-muted-foreground">
      {note && (
        <>
          <span className="truncate">{note}</span>
          <span aria-hidden className="flex-none text-fg-subtle">
            ·
          </span>
        </>
      )}
      <span className="flex-none tabular-nums">{when(at)}</span>
    </div>
  );
}
