import { useEffect, useState } from "react";
import type { QueueSpec } from "@sift/ipc-contract";
import { useAiPickers } from "@/lib/use-ai-pickers";

const MAXRES = [
  { label: "Any", value: "" },
  { label: "2160p", value: "2160" },
  { label: "1440p", value: "1440" },
  { label: "1080p", value: "1080" },
  { label: "720p", value: "720" },
  { label: "480p", value: "480" },
];

/** The format-preference + op-toggle controls shared by the Queue page and Channel detail.
 * Calls `onChange` with the current QueueSpec whenever a control changes. */
export function QueueSpecControls({ onChange }: { onChange: (spec: QueueSpec) => void }) {
  const [formatKind, setFormatKind] = useState<"best" | "audio">("best");
  const [maxRes, setMaxRes] = useState("");
  const [wantTranscript, setWantTranscript] = useState(false);
  const [wantSummarize, setWantSummarize] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const ai = useAiPickers();

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
      <div className="flex flex-wrap items-center gap-3">
        <select
          data-testid="queue-format"
          className="rounded border border-border bg-background p-1"
          value={formatKind}
          onChange={(e) => setFormatKind(e.target.value as "best" | "audio")}
        >
          <option value="best">Best video</option>
          <option value="audio">Audio only</option>
        </select>
        <select
          data-testid="queue-maxres"
          className="rounded border border-border bg-background p-1"
          value={maxRes}
          onChange={(e) => setMaxRes(e.target.value)}
          disabled={formatKind === "audio"}
        >
          {MAXRES.map((m) => (
            <option key={m.value} value={m.value}>
              Max {m.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input data-testid="queue-op-transcript" type="checkbox" checked={wantTranscript} onChange={(e) => setWantTranscript(e.target.checked)} />
          Transcript
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input data-testid="queue-op-summarize" type="checkbox" checked={wantSummarize} onChange={(e) => setWantSummarize(e.target.checked)} />
          Summarize
        </label>
        <input
          data-testid="queue-tags"
          className="rounded border border-border bg-background p-1 text-sm"
          type="text"
          placeholder="Tags (comma-separated)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
        />
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
