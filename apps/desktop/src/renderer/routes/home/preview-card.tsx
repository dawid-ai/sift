import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type {
  AiProviderInfo,
  DownloadOption,
  DownloadProgress,
  MediaListItem,
  MediaMetadata,
  PromptInfo,
  TranscriptRecord,
} from "@sift/ipc-contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TagChip } from "@/components/tag-chip";

const TIER_LABELS: Record<MediaMetadata["platform"]["tier"], string> = {
  tested: "Tested",
  supported: "Supported",
  unknown: "Unverified",
};

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
  return [o.label, o.detail, size ? `~${size}` : ""].filter(Boolean).join(" · ");
}

/** Human-readable transfer rate, e.g. "1.2 MB/s"; `null`/non-finite renders "". */
export function formatSpeed(bytesPerSec: number | null): string {
  if (bytesPerSec === null || !Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "";
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

const DEFAULT_MODEL_ID = "claude-opus-4-8";

// Stable empty-array reference so the models-sync effect doesn't re-fire every
// render while no provider is selected yet (before `defaultProviderId` resolves).
const NO_MODELS: AiProviderInfo["models"] = [];

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
  const doneFormats = existing ? existing.formats.filter((f) => f.status === "done") : [];
  const existingMatch = selected ? doneFormats.find((f) => f.id === selected.id) : undefined;
  const percent =
    progress && progress.total
      ? Math.min(100, Math.round((progress.received / progress.total) * 100))
      : null;

  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedPromptId, setSelectedPromptId] = useState<number | "">("");

  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [ollamaState, setOllamaState] = useState<"idle" | "checking" | "down" | "not-installed">("idle");

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
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

  const models = providers.find((p) => p.id === selectedProviderId)?.models ?? NO_MODELS;
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
      transition={{ ease: "easeOut" }}
      className="w-full max-w-xl"
    >
      <Card data-testid="preview-card">
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle data-testid="preview-title" className="line-clamp-2">
            {metadata.title}
          </CardTitle>
          <Badge data-testid="preview-platform" variant="outline" className="shrink-0">
            {metadata.platform.label} · {TIER_LABELS[metadata.platform.tier]}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {metadata.thumbnailUrl && (
            <img
              src={metadata.thumbnailUrl}
              alt={metadata.title}
              className="max-w-full rounded"
            />
          )}
          <div className="flex flex-col gap-1 text-sm text-foreground/70">
            {metadata.uploader && <p>{metadata.uploader}</p>}
            <p>{formatDuration(metadata.durationSec)}</p>
            <p>{metadata.hasCaptions ? "Captions available" : "No captions"}</p>
          </div>

          {doneFormats.length > 0 && (
            <p data-testid="already-captured" className="text-sm text-foreground/70">
              Already in your library — {doneFormats.map((f) => f.label).join(", ")}
            </p>
          )}

          <div className="flex items-center gap-2">
            <select
              data-testid="download-format"
              value={selectedId}
              disabled={downloading}
              onChange={(e) => setSelectedId(e.target.value)}
              className="flex h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {optionLabel(opt)}
                </option>
              ))}
            </select>
            <Button
              data-testid="download-button"
              disabled={downloading || !selected}
              onClick={() => selected && onDownload(selected, tags)}
            >
              {downloading
                ? "Downloading…"
                : existingMatch && selected
                  ? `Re-download ${selected.label}`
                  : "Download"}
            </Button>
            <Button
              data-testid="transcript-button"
              variant="outline"
              disabled={transcribing}
              onClick={() => onTranscribe()}
            >
              {transcribing ? (transcriptStageLabel ?? "Transcribing…") : "Get transcript"}
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
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
              className="flex h-9 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <TagChip key={t} name={t} onRemove={() => setTags((prev) => prev.filter((x) => x !== t))} />
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
                className="flex flex-col gap-1.5"
              >
                <div className="h-2.5 overflow-hidden rounded-full bg-border">
                  {percent !== null ? (
                    <motion.div
                      data-testid="download-progress"
                      className="h-full rounded-full bg-primary"
                      animate={{ width: `${percent}%` }}
                      transition={{ ease: "easeOut" }}
                    />
                  ) : (
                    <motion.div
                      data-testid="download-progress"
                      className="h-full w-1/3 rounded-full bg-primary"
                      animate={{ x: ["-100%", "300%"] }}
                      transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                    />
                  )}
                </div>
                <p
                  data-testid="download-status"
                  className="flex justify-between text-xs text-foreground/60"
                >
                  <span>{percent !== null ? `${percent}%` : "Starting…"}</span>
                  <span>
                    {[formatSpeed(progress?.speed ?? null), formatEta(progress?.eta ?? null)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-wrap items-center gap-2">
            <select
              data-testid="summary-provider"
              value={selectedProviderId}
              disabled={summarizing || providers.length === 0}
              onChange={(e) => setSelectedProviderId(e.target.value)}
              className="flex h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <select
              data-testid="summary-model"
              value={selectedModel}
              disabled={summarizing || models.length === 0}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="flex h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              data-testid="summary-prompt"
              value={selectedPromptId}
              disabled={summarizing || prompts.length === 0}
              onChange={(e) => setSelectedPromptId(Number(e.target.value))}
              className="flex h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button
              data-testid="summarize-button"
              variant="outline"
              disabled={
                !transcript ||
                summarizing ||
                selectedProviderId === "" ||
                selectedModel === "" ||
                selectedPromptId === ""
              }
              onClick={() => void runSummarizeChecked()}
            >
              {summarizing ? "Summarizing…" : "Summarize"}
            </Button>
          </div>
          {(ollamaState === "down" || ollamaState === "not-installed") && (
            <div data-testid="ollama-down-panel" className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3">
              <p className="text-sm text-warning">
                {ollamaState === "not-installed" ? "Ollama isn't installed." : "Ollama isn't running."}
              </p>
              <div className="flex items-center gap-2">
                {ollamaState === "down" && (
                  <Button size="sm" data-testid="ollama-start" onClick={() => void handleStartOllama()}>
                    Start Ollama
                  </Button>
                )}
                <Button size="sm" variant="outline" data-testid="ollama-recheck" onClick={() => void handleRecheckOllama()}>
                  Recheck
                </Button>
                {ollamaState === "not-installed" && (
                  <button
                    type="button"
                    data-testid="ollama-install-link"
                    className="text-sm text-primary underline"
                    onClick={() => void window.sift.library.openExternal("https://ollama.com")}
                  >
                    Get Ollama
                  </button>
                )}
              </div>
            </div>
          )}
          {!transcript && (
            <p className="text-xs text-foreground/50">Get a transcript first</p>
          )}
          {transcript && noProviderReady && (
            <p data-testid="summary-no-provider" className="text-xs text-foreground/50">
              Add an AI provider key in Settings
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
