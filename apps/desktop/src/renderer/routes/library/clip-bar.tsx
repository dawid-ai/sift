import { useState } from "react";
import { Link2, Scissors } from "lucide-react";
import type { ClipKind, TranscriptCue } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/transcript-view";

const KINDS: { kind: ClipKind; label: string }[] = [
  { kind: "audio", label: "Audio" },
  { kind: "video", label: "Video" },
  { kind: "vertical", label: "Vertical short" },
];

/**
 * Turns a selected transcript span into a shareable link or a media clip.
 *
 * Renders only once a span is picked. The link is produced in main, which knows each
 * platform's timestamp parameter and returns null where there isn't one — so the Copy link
 * button appears only when it would actually work.
 */
export function ClipBar({
  mediaId,
  cues,
  fromIndex,
  toIndex,
  onClear,
}: {
  mediaId: number;
  cues: TranscriptCue[];
  fromIndex: number;
  toIndex: number;
  onClear: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ClipKind | "link" | null>(null);

  const lo = Math.min(fromIndex, toIndex);
  const hi = Math.max(fromIndex, toIndex);
  const start = cues[lo]?.start ?? 0;
  const end = cues[hi]?.end ?? start;

  async function copyLink() {
    setBusy("link");
    setError(null);
    setMessage(null);
    try {
      const url = await window.sift.clip.link(mediaId, start);
      if (!url) {
        setError("This platform has no timestamp link.");
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage(`Copied ${url}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function exportClip(kind: ClipKind) {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      const result = await window.sift.clip.export(mediaId, kind, start, end);
      setMessage(`Wrote ${result.path}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      data-testid="clip-bar"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.07] px-3 py-2"
    >
      <Scissors aria-hidden className="h-3.5 w-3.5 text-foreground/60" />
      <span
        data-testid="clip-range"
        className="text-[12px] tabular-nums text-foreground"
      >
        {formatTimestamp(start)} – {formatTimestamp(end)}
      </span>
      <span className="text-[12px] text-foreground/50">
        ({hi - lo + 1} {hi === lo ? "cue" : "cues"})
      </span>

      <span className="mx-1 h-5 w-px bg-white/10" aria-hidden />

      <Button
        variant="ghost"
        className="h-8 px-2.5 text-[12px]"
        data-testid="clip-copy-link"
        disabled={busy !== null}
        onClick={() => void copyLink()}
      >
        <Link2 aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        Copy link
      </Button>
      {KINDS.map(({ kind, label }) => (
        <Button
          key={kind}
          variant="ghost"
          className="h-8 px-2.5 text-[12px]"
          data-testid={`clip-export-${kind}`}
          disabled={busy !== null}
          onClick={() => void exportClip(kind)}
        >
          {busy === kind ? "Cutting…" : label}
        </Button>
      ))}

      <Button
        variant="ghost"
        className="ml-auto h-8 px-2.5 text-[12px]"
        data-testid="clip-clear"
        onClick={onClear}
      >
        Clear
      </Button>

      {(message ?? error) && (
        <p
          data-testid="clip-message"
          className={`w-full break-all text-[12px] ${error ? "text-danger" : "text-foreground/70"}`}
        >
          {error ?? message}
        </p>
      )}
    </div>
  );
}
