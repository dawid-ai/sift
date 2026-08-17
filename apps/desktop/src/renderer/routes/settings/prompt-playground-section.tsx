import { useState } from "react";
import { Zap } from "lucide-react";
import { POLISH_SYSTEM_PROMPT } from "@sift/core";
import { Button } from "@/components/ui/button";
import { useAiPickers } from "@/lib/use-ai-pickers";
import {
  GroupLabel,
  SettingRow,
  SettingsError,
  SettingsSelect,
  SettingsTextarea,
} from "./settings-page";

const MONO_TEXTAREA = "min-h-[7rem] font-mono text-xs leading-relaxed";

/** A standalone prompt playground: paste a transcript, edit the system prompt, run it through
 * any configured provider, and read the raw output. For tuning the distillation prompt. */
export function PromptPlaygroundSection() {
  const {
    providers,
    selectedProviderId,
    setSelectedProviderId,
    models,
    selectedModel,
    setSelectedModel,
  } = useAiPickers();
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
    <div data-testid="prompt-playground" className="flex flex-col gap-5">
      <SettingRow
        label="Run with"
        hint="Provider and model used for this one-off run."
      >
        <SettingsSelect
          data-testid="playground-provider"
          value={selectedProviderId}
          disabled={running || providers.length === 0}
          onChange={(e) => setSelectedProviderId(e.target.value)}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </SettingsSelect>
        <SettingsSelect
          data-testid="playground-model"
          value={selectedModel}
          disabled={running || models.length === 0}
          onChange={(e) => setSelectedModel(e.target.value)}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </SettingsSelect>
      </SettingRow>

      <div className="flex flex-col gap-2">
        <GroupLabel>System prompt</GroupLabel>
        <SettingsTextarea
          data-testid="playground-system"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className={MONO_TEXTAREA}
          spellCheck={false}
        />
      </div>

      <div className="flex flex-col gap-2">
        <GroupLabel>Transcript / content</GroupLabel>
        <SettingsTextarea
          data-testid="playground-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste a transcript (with or without [[SLIDE n]] markers)…"
          className={MONO_TEXTAREA}
          spellCheck={false}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          data-testid="playground-run"
          size="lg"
          disabled={
            running || !selectedProviderId || !selectedModel || !content.trim()
          }
          onClick={() => void run()}
        >
          <Zap className="h-4 w-4" />
          {running ? "Running…" : "Run"}
        </Button>
        {running && (
          <span className="text-[12px] text-foreground/60">
            Waiting for the provider…
          </span>
        )}
      </div>

      {error && (
        <SettingsError data-testid="playground-error">{error}</SettingsError>
      )}

      {output && (
        <div className="flex flex-col gap-2">
          <GroupLabel>Output</GroupLabel>
          <SettingsTextarea
            data-testid="playground-output"
            readOnly
            value={output}
            className={`${MONO_TEXTAREA} min-h-[12rem] bg-surface/60`}
          />
        </div>
      )}
    </div>
  );
}
