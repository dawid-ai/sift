import { useEffect, useState, type ReactNode } from "react";
import type { QueueSpec } from "@sift/ipc-contract";
import { useAiPickers } from "@/lib/use-ai-pickers";

const MAXRES = [
  { label: "Best available", value: "" },
  { label: "Max 2160p", value: "2160" },
  { label: "Max 1440p", value: "1440" },
  { label: "Max 1080p", value: "1080" },
  { label: "Max 720p", value: "720" },
  { label: "Max 480p", value: "480" },
];

/** A small caption above a control, so the bare Queue controls read as labeled fields. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** The format-preference + op-toggle controls shared by the Queue page and Channel detail.
 * Calls `onChange` with the current QueueSpec whenever a control changes. */
export function QueueSpecControls({ onChange }: { onChange: (spec: QueueSpec) => void }) {
  const [formatKind, setFormatKind] = useState<"best" | "audio">("best");
  const [maxRes, setMaxRes] = useState("");
  const [wantTranscript, setWantTranscript] = useState(false);
  const [wantSummarize, setWantSummarize] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const ai = useAiPickers();

  useEffect(() => {
    window.sift.tags.listAll().then((rows) => setAllTags(rows.map((r) => r.name)));
  }, []);

  // Tag suggestions: existing tags matching the text after the last comma, minus ones already typed.
  const enteredTags = tagsInput.split(",").map((s) => s.trim()).filter(Boolean);
  const lastToken = tagsInput.slice(tagsInput.lastIndexOf(",") + 1).trim();
  const tagSuggestions = lastToken
    ? allTags
        .filter((n) => n.toLowerCase().includes(lastToken.toLowerCase()) && !enteredTags.some((t) => t.toLowerCase() === n.toLowerCase()))
        .slice(0, 6)
    : [];
  function pickTag(name: string) {
    const cut = tagsInput.lastIndexOf(",");
    const prefix = cut >= 0 ? `${tagsInput.slice(0, cut + 1)} ` : "";
    setTagsInput(`${prefix}${name}, `);
  }

  useEffect(() => {
    const summarize: QueueSpec["summarize"] =
      wantSummarize && ai.selectedProviderId && ai.selectedModel && ai.selectedPromptId !== ""
        ? { providerId: ai.selectedProviderId, model: ai.selectedModel, promptId: Number(ai.selectedPromptId) }
        : null;
    const tags = tagsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onChange({
      format: { kind: formatKind === "audio" ? "audio" : "video", maxHeight: maxRes ? Number(maxRes) : null, mp4: true },
      download: true,
      transcript: wantTranscript,
      summarize,
      tags,
    });
  }, [formatKind, maxRes, wantTranscript, wantSummarize, tagsInput, ai.selectedProviderId, ai.selectedModel, ai.selectedPromptId, onChange]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <Field label="Format">
          <select
            data-testid="queue-format"
            className="rounded border border-border bg-background p-1"
            value={formatKind}
            onChange={(e) => setFormatKind(e.target.value as "best" | "audio")}
          >
            <option value="best">Video &amp; Audio</option>
            <option value="audio">Audio only</option>
          </select>
        </Field>
        <Field label="Quality">
          <select
            data-testid="queue-maxres"
            className="rounded border border-border bg-background p-1"
            value={maxRes}
            onChange={(e) => setMaxRes(e.target.value)}
            disabled={formatKind === "audio"}
          >
            {MAXRES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Get transcript">
          <label className="flex h-8 items-center gap-1 text-sm">
            <input data-testid="queue-op-transcript" type="checkbox" checked={wantTranscript} onChange={(e) => setWantTranscript(e.target.checked)} />
            Transcribe
          </label>
        </Field>
        <Field label="Run prompt">
          <label className="flex h-8 items-center gap-1 text-sm">
            <input data-testid="queue-op-summarize" type="checkbox" checked={wantSummarize} onChange={(e) => setWantSummarize(e.target.checked)} />
            Summarize
          </label>
        </Field>
        <Field label="Add tags">
          <div className="relative flex flex-col gap-1">
            <input
              data-testid="queue-tags"
              className="rounded border border-border bg-background p-1 text-sm"
              type="text"
              placeholder="tag1, tag2…"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
            {tagSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tagSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    data-testid="queue-tag-suggestion"
                    onClick={() => pickTag(s)}
                    className="rounded bg-border px-1.5 py-px text-[11px] text-muted-foreground hover:bg-primary/15 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>
      </div>
      {wantSummarize && (
        <div className="flex flex-wrap gap-2">
          <select className="rounded border border-border bg-background p-1" value={ai.selectedProviderId} onChange={(e) => ai.setSelectedProviderId(e.target.value)}>
            {ai.providers.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
          </select>
          <select className="rounded border border-border bg-background p-1" value={ai.selectedModel} onChange={(e) => ai.setSelectedModel(e.target.value)}>
            {ai.models.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
          </select>
          <select className="rounded border border-border bg-background p-1" value={ai.selectedPromptId} onChange={(e) => ai.setSelectedPromptId(e.target.value === "" ? "" : Number(e.target.value))}>
            {ai.prompts.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
        </div>
      )}
    </div>
  );
}
