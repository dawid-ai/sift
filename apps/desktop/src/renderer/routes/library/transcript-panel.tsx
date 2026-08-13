import { useEffect, useRef, useState } from "react";
import type { MediaDetail } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { transcriptStageLabel } from "@/lib/transcript-stage-label";
import { activeSegmentIndex, formatTimestamp } from "@/lib/transcript-view";

/** Which transcript job (if any) this view kicked off — lets only the clicked button show a
 * progress label while the other merely disables. */
export type TranscribeMode = "captions" | "whisper" | null;

export interface TranscriptPanelProps {
  transcripts: MediaDetail["transcripts"];
  hasPlayer: boolean;
  currentTime: number;
  transcribeMode: TranscribeMode;
  transcriptStage: string | null;
  /** 0..1 whisper progress, or null when unknown / not running. */
  transcriptRatio: number | null;
  canRetranscribe: boolean;
  onSeek: (sec: number) => void;
  onGetTranscript: () => void;
  onRetranscribe: () => void;
  onRemoveTranscript: (id: number) => void;
  onExportSrt: (id: number) => void;
}

/** The single transcript view: a synced, searchable segment list. Clicking a segment seeks the
 * in-app player (onSeek); the segment matching the player's currentTime is highlighted and
 * scrolled into view. Source transcripts appear as one compact removable row each (no duplicate
 * full-text block), plus the Get transcript / Re-transcribe actions. */
export function TranscriptPanel({
  transcripts, hasPlayer, currentTime, transcribeMode, transcriptStage, transcriptRatio,
  canRetranscribe, onSeek, onGetTranscript, onRetranscribe, onRemoveTranscript, onExportSrt,
}: TranscriptPanelProps) {
  const [search, setSearch] = useState("");
  const timed = transcripts.find((t) => t.segments.length > 0) ?? null;
  // A transcript with no timestamps (rare) can't drive the synced viewer — show its raw text.
  const fallbackText = !timed ? transcripts[0]?.text ?? null : null;
  const q = search.trim().toLowerCase();
  const segments = timed
    ? q === "" ? timed.segments : timed.segments.filter((s) => s.text.toLowerCase().includes(q))
    : [];
  // Active index is computed over the FULL segment list (playback position is absolute),
  // then matched by start time within the filtered view.
  const activeStart = timed ? timed.segments[activeSegmentIndex(timed.segments, currentTime)]?.start ?? null : null;

  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeStart]);

  const busy = transcribeMode !== null;

  return (
    <div className="flex flex-col gap-4">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm" data-testid="media-detail-get-transcript"
          disabled={busy} onClick={onGetTranscript}
        >
          {transcribeMode === "captions" ? transcriptStageLabel(transcriptStage) : "Get transcript"}
        </Button>
        {canRetranscribe && (
          <Button
            size="sm" variant="outline" data-testid="media-detail-retranscribe"
            disabled={busy} onClick={onRetranscribe}
          >
            {transcribeMode === "whisper" ? transcriptStageLabel(transcriptStage) : "Re-transcribe with Whisper"}
          </Button>
        )}
      </div>

      {/* Whisper progress bar — only the transcribe stage reports a ratio (audio extract is quick). */}
      {transcribeMode === "whisper" && transcriptRatio !== null && (
        <div data-testid="transcript-progress" className="flex flex-col gap-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-ai transition-[width] duration-300"
              style={{ width: `${Math.round(transcriptRatio * 100)}%` }}
            />
          </div>
          <p className="text-xs tabular-nums text-foreground/50">
            {transcriptStageLabel(transcriptStage)} · {Math.round(transcriptRatio * 100)}%
          </p>
        </div>
      )}

      {/* Source transcripts — one compact removable row each (no duplicated full-text block). */}
      {transcripts.length > 0 && (
        <div className="flex flex-col gap-1">
          {transcripts.map((t) => (
            <div
              key={t.id}
              data-testid="media-detail-transcript"
              className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
            >
              <span className="font-medium text-foreground/70">{t.providerId}</span>
              {t.language && <span className="text-foreground/45">· {t.language}</span>}
              {t.segments.length > 0 && (
                <span className="text-foreground/45">· {t.segments.length} lines</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm" variant="outline"
                  data-testid={`transcript-export-srt-${t.id}`}
                  disabled={busy || t.segments.length === 0}
                  onClick={() => onExportSrt(t.id)}
                >
                  Export .srt
                </Button>
                <button
                  type="button"
                  data-testid="media-detail-transcript-remove"
                  onClick={() => onRemoveTranscript(t.id)}
                  className="text-foreground/45 hover:text-red-500"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {timed && (
        <div className="flex flex-col gap-2">
          <input
            data-testid="media-detail-transcript-search"
            type="search" placeholder="Search transcript…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <div className="max-h-[26rem] overflow-y-auto rounded-lg border border-border">
            {segments.map((seg) => {
              const active = seg.start === activeStart;
              return (
                <button
                  key={`${seg.start}-${seg.end}`}
                  ref={active ? activeRef : undefined}
                  type="button"
                  data-testid="media-detail-transcript-segment"
                  data-active={active ? "true" : undefined}
                  onClick={() => onSeek(seg.start)}
                  className={`flex w-full items-baseline gap-3 border-b border-border/70 px-3 py-2 text-left text-sm leading-relaxed transition-colors last:border-b-0 ${
                    active ? "bg-ai/[0.14] text-foreground" : "hover:bg-foreground/[0.04]"
                  }`}
                >
                  <span
                    className={`flex-none font-mono text-xs tabular-nums ${
                      active ? "text-ai" : "text-foreground/40"
                    }`}
                  >
                    {formatTimestamp(seg.start)}
                  </span>
                  <span className="min-w-0">{seg.text}</span>
                </button>
              );
            })}
            {segments.length === 0 && <p className="px-3 py-2 text-sm text-foreground/60">No matching lines.</p>}
          </div>
          {!hasPlayer && (
            <p className="text-xs text-foreground/45">Download this video to jump to a line in the player.</p>
          )}
        </div>
      )}

      {fallbackText && (
        <p className="max-h-[26rem] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border p-3 text-sm leading-relaxed">
          {fallbackText}
        </p>
      )}

      {transcripts.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-foreground/50">
          No transcript yet. Get one from captions, or re-transcribe a downloaded video with Whisper.
        </p>
      )}
    </div>
  );
}
