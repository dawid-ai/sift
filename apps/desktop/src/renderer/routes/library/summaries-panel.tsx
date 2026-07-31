import type { MediaDetail } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { useAiPickers } from "@/lib/use-ai-pickers";

const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50";
const LABEL_CLASS = "mb-1 block text-xs font-medium text-foreground/50";

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

  return (
    <div className="flex flex-col gap-4">
      {/* Generate control */}
      <div className="rounded-xl border border-border bg-foreground/[0.02] p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={LABEL_CLASS}>Provider</label>
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
          </div>
          <div>
            <label className={LABEL_CLASS}>Model</label>
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
          </div>
          <div>
            <label className={LABEL_CLASS}>Prompt</label>
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
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
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
            {summarizing ? "Summarizing…" : "Run prompt"}
          </Button>
          {transcriptsCount === 0 && (
            <span className="text-xs text-foreground/50">Get a transcript first</span>
          )}
          {transcriptsCount > 0 && noProviderReady && (
            <span data-testid="media-detail-no-provider" className="text-xs text-foreground/50">
              Add an AI provider key in Settings
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      {summaries.map((s) => (
        <div
          key={s.id}
          data-testid="media-detail-summary"
          className="rounded-xl border border-border p-4"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-medium text-foreground/50">
              {s.providerId} · {s.model}
            </span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                data-testid="media-detail-summary-export"
                onClick={() => void window.sift.summarize.export(s.id)}
                className="text-xs text-foreground/50 hover:text-foreground"
              >
                Export
              </button>
              <button
                type="button"
                data-testid="media-detail-summary-remove"
                onClick={() => onRemove(s.id)}
                className="text-xs text-foreground/50 hover:text-red-500"
              >
                Remove
              </button>
            </div>
          </div>
          <p className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">{s.text}</p>
        </div>
      ))}
      {summaries.length === 0 && !blocked && (
        <p className="text-sm text-foreground/50">No summaries yet — run a prompt above.</p>
      )}
    </div>
  );
}
