import type { ReactNode } from "react";
import type { DocumentRecord, PromptInfo, SummaryRecord, TranscriptRecord } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";

/** ms epoch → short local date+time. */
function when(ms: number): string {
  return new Date(ms).toLocaleString();
}

function providerLabel(providerId: string | null, model: string | null): string {
  return providerId ? `${providerId} · ${model ?? ""}`.trim() : "No AI (raw)";
}

export interface FilesPanelProps {
  documents: DocumentRecord[];
  transcripts: TranscriptRecord[];
  summaries: SummaryRecord[];
  prompts: PromptInfo[];
  onReveal: (path: string) => void;
  onOpenTab: (tab: "transcript" | "summary") => void;
}

/** The "everything created for this video" hub: generated documents, the transcripts and
 * summaries that exist, and a history of every AI prompt run. Downloads are listed separately. */
export function FilesPanel({ documents, transcripts, summaries, prompts, onReveal, onOpenTab }: FilesPanelProps) {
  const promptName = (id: number | null): string =>
    (id != null && prompts.find((p) => p.id === id)?.name) || "—";

  // Prompts run = every AI execution tied to this video: each summary (its prompt) plus each
  // AI-distilled document. Raw documents (no provider) aren't prompt runs.
  const runs = [
    ...summaries.map((s) => ({
      key: `s${s.id}`,
      kind: "Summary",
      label: promptName(s.promptId),
      providerId: s.providerId,
      model: s.model,
      path: s.filePath,
      at: s.createdAt,
    })),
    ...documents
      .filter((d) => d.providerId)
      .map((d) => ({
        key: `d${d.id}`,
        kind: "Document",
        label: "Distillation",
        providerId: d.providerId!,
        model: d.model ?? "",
        path: d.path as string | null,
        at: d.createdAt,
      })),
  ].sort((a, b) => b.at - a.at);

  return (
    <div className="flex flex-col gap-6">
      <Section title="Documents" empty={documents.length === 0 ? "No documents yet — build one from the Slides tab." : null}>
        {documents.map((d) => (
          <Row key={d.id} testid="files-document">
            <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{d.format}</span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm">{d.path.split(/[\\/]/).pop()}</span>
              <span className="text-xs text-foreground/50">{providerLabel(d.providerId, d.model)} · {when(d.createdAt)}</span>
            </div>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => onReveal(d.path)}>
              Open
            </Button>
          </Row>
        ))}
      </Section>

      <Section title="Transcripts" empty={transcripts.length === 0 ? "No transcripts yet." : null}>
        {transcripts.map((t) => (
          <Row key={t.id} testid="files-transcript">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm">{t.providerId}{t.language ? ` · ${t.language}` : ""}</span>
              <span className="text-xs text-foreground/50">{when(t.createdAt)}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {t.filePath && (
                <Button size="sm" variant="outline" onClick={() => onReveal(t.filePath!)}>
                  Open
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => onOpenTab("transcript")}>
                Go to
              </Button>
            </div>
          </Row>
        ))}
      </Section>

      <Section title="Summaries" empty={summaries.length === 0 ? "No summaries yet." : null}>
        {summaries.map((s) => (
          <Row key={s.id} testid="files-summary">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm">{promptName(s.promptId)}</span>
              <span className="text-xs text-foreground/50">{s.providerId} · {s.model} · {when(s.createdAt)}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {s.filePath && (
                <Button size="sm" variant="outline" onClick={() => onReveal(s.filePath!)}>
                  Open
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => onOpenTab("summary")}>
                Go to
              </Button>
            </div>
          </Row>
        ))}
      </Section>

      <Section title="Prompts run" empty={runs.length === 0 ? "No AI prompts run yet." : null}>
        {runs.map((r) => (
          <Row key={r.key} testid="files-prompt-run">
            <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{r.kind}</span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm">{r.label}</span>
              <span className="text-xs text-foreground/50">{r.providerId} · {r.model} · {when(r.at)}</span>
            </div>
            {r.path && (
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => onReveal(r.path!)}>
                Open
              </Button>
            )}
          </Row>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string | null; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{title}</p>
      {empty ? <p className="text-sm text-foreground/50">{empty}</p> : <div className="flex flex-col gap-1.5">{children}</div>}
    </div>
  );
}

function Row({ testid, children }: { testid: string; children: ReactNode }) {
  return (
    <div data-testid={testid} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
      {children}
    </div>
  );
}
