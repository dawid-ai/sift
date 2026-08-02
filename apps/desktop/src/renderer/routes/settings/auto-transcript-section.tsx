import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";

/** Toggle: auto-fetch a transcript right after a video finishes downloading. Loads on mount,
 * persists on change. When on, a caption-less video already has its file on disk for Whisper. */
export function AutoTranscriptSection() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.sift.transcript
      .getAutoDownload()
      .then(setEnabled)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function persist(next: boolean) {
    setEnabled(next);
    setError(null);
    try {
      await window.sift.transcript.setAutoDownload(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="auto-transcript-section">
      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="text-sm font-medium">Get transcript after download</span>
          <span className="block text-xs text-foreground/50">
            When on, transcribing runs automatically once a video downloads — so a caption-less
            video already has its file ready for Whisper.
          </span>
        </span>
        <Switch
          data-testid="auto-transcript-toggle"
          aria-label="Get transcript after download"
          checked={enabled ?? true}
          disabled={enabled === null}
          onChange={(next) => void persist(next)}
        />
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
