import { useEffect, useState } from "react";
import type { TranscriptMethod } from "@sift/ipc-contract";

const METHODS: { value: TranscriptMethod; label: string; description: string }[] = [
  { value: "auto", label: "Auto", description: "Use captions if available, Whisper if none." },
  {
    value: "prefer_whisper",
    label: "Prefer Whisper",
    description: "Use local Whisper when the video is downloaded, else captions.",
  },
  { value: "captions_only", label: "Captions only", description: "Never use Whisper." },
];

/** Default transcript method used by transcript.get. Loads on mount, persists on every change. */
export function TranscriptMethodSection() {
  const [method, setMethod] = useState<TranscriptMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.sift.transcript
      .getMethod()
      .then(setMethod)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function persist(next: TranscriptMethod) {
    setMethod(next);
    setError(null);
    try {
      await window.sift.transcript.setMethod(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="transcript-method-section">
      <p className="text-sm text-foreground/60">
        How transcripts are fetched by default when adding a new video.
      </p>
      <div className="flex flex-col gap-2">
        {METHODS.map((m) => (
          <label
            key={m.value}
            data-testid={`transcript-method-option-${m.value}`}
            className="flex items-start gap-3 rounded-md border border-border px-3 py-2 text-sm"
          >
            <input
              type="radio"
              name="transcript-method"
              value={m.value}
              checked={method === m.value}
              onChange={() => void persist(m.value)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">{m.label}</span>
              <span className="block text-xs text-foreground/50">{m.description}</span>
            </span>
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
