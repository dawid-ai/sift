import { useState } from "react";
import { POLISH_SYSTEM_PROMPT } from "@sift/core";
import { Button } from "@/components/ui/button";
import { useAiPickers } from "@/lib/use-ai-pickers";

const SELECT_CLASS =
  "h-9 min-w-0 rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";
const TEXTAREA_CLASS =
  "min-h-[7rem] w-full rounded-md border border-border bg-background px-2.5 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** A standalone prompt playground: paste a transcript, edit the system prompt, run it through
 * any configured provider, and read the raw output. For tuning the distillation prompt. */
export function PromptPlaygroundSection() {
  const { providers, selectedProviderId, setSelectedProviderId, models, selectedModel, setSelectedModel } =
    useAiPickers();
  const [systemPrompt, setSystemPrompt] = useState(POLISH_SYSTEM_PROMPT);
  const [content, setContent] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!selectedProviderId || !selectedModel || !content.trim()) return;
    setRunning(true);
    setError(null);
    setOutput("");
    try {
      setOutput(
        await window.sift.aiProviders.runPrompt({
          providerId: selectedProviderId,
          model: selectedModel,
          systemPrompt,
          content,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div data-testid="prompt-playground" className="flex flex-col gap-3">
      <p className="text-sm text-foreground/60">
        Paste a transcript, tweak the prompt, and run it through a provider — for tuning the document
        distillation prompt. Nothing is saved.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
        <select
          data-testid="playground-provider"
          value={selectedProviderId}
          disabled={running || providers.length === 0}
          onChange={(e) => setSelectedProviderId(e.target.value)}
          className={SELECT_CLASS}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <select
          data-testid="playground-model"
          value={selectedModel}
          disabled={running || models.length === 0}
          onChange={(e) => setSelectedModel(e.target.value)}
          className={SELECT_CLASS}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      <label className="text-xs font-medium text-foreground/50">System prompt</label>
      <textarea
        data-testid="playground-system"
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        className={TEXTAREA_CLASS}
        spellCheck={false}
      />

      <label className="text-xs font-medium text-foreground/50">Transcript / content</label>
      <textarea
        data-testid="playground-content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Paste a transcript (with or without [[SLIDE n]] markers)…"
        className={TEXTAREA_CLASS}
        spellCheck={false}
      />

      <div className="flex items-center gap-2">
        <Button
          data-testid="playground-run"
          disabled={running || !selectedProviderId || !selectedModel || !content.trim()}
          onClick={() => void run()}
        >
          {running ? "Running…" : "Run"}
        </Button>
      </div>

      {error && (
        <p data-testid="playground-error" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {output && (
        <>
          <label className="text-xs font-medium text-foreground/50">Output</label>
          <textarea data-testid="playground-output" readOnly value={output} className={`${TEXTAREA_CLASS} min-h-[12rem]`} />
        </>
      )}
    </div>
  );
}
