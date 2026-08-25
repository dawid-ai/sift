import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Captions, Pencil, Scissors, Search } from "lucide-react";
import type { MediaDetail } from "@sift/ipc-contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { transcriptProviderLabel } from "@/lib/transcript-provider-label";
import { transcriptStageLabel } from "@/lib/transcript-stage-label";
import { activeSegmentIndex, formatTimestamp } from "@/lib/transcript-view";
// The Files tab owns the one wording for a transcript's language; this panel lists the same
// records, so it reads them from there instead of printing the raw code.
import { languageName } from "./files-panel";
import { TranscriptEditor } from "./transcript-editor";
import { ClipBar } from "./clip-bar";

/** Which transcript job (if any) this view kicked off — lets only the clicked button show a
 * progress label while the other merely disables. */
export type TranscribeMode = "captions" | "whisper" | null;

/** Secondary action: no fill, no second hue. Exactly one filled CTA per panel. */
const GHOST_BUTTON =
  "border border-white/10 bg-transparent text-muted-foreground hover:border-white/20 hover:bg-white/[0.04] hover:text-foreground";

/** Destructive secondary: the same shell as its neighbours at rest — an unbordered word beside
 * a bordered button reads as an unstyled leftover and has no visible hit target — with the
 * danger signal spent on hover only. Mirrors the header's Remove control. */
const DANGER_GHOST_BUTTON = `${GHOST_BUTTON} hover:border-danger/30 hover:bg-danger/10 hover:text-danger`;

/** Empty states are not drop targets, so they must not borrow the dashed drop-zone idiom. */
const EMPTY_BOX =
  "flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-9 text-center";
const EMPTY_CHIP =
  "grid h-8 w-8 place-items-center rounded-lg bg-white/[0.05] text-foreground/50";

/* Both scrollers below wear `.scroll-thin` from globals.css — the foundation's one "scrollbar
 * inside a card" recipe (a thumb with a transparent gutter, so it clears the container's own
 * hairline instead of fusing with it into a second bright edge). This file and media-detail.tsx
 * each carried a byte-identical `THIN_SCROLLBAR` copy of it; one definition, no drift. */

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
  /** Owning media id — the clip actions need it. */
  mediaId: number;
  /** Called after an edit is saved, so the detail view refetches. */
  onTranscriptEdited?: () => void;
}

/** The single transcript view: a synced, searchable segment list. Clicking a segment seeks the
 * in-app player (onSeek); the segment matching the player's currentTime is highlighted and
 * scrolled into view. Source transcripts appear as one compact removable row each (no duplicate
 * full-text block), plus the Get transcript / Re-transcribe actions. */
export function TranscriptPanel({
  transcripts,
  hasPlayer,
  currentTime,
  transcribeMode,
  transcriptStage,
  transcriptRatio,
  canRetranscribe,
  onSeek,
  onGetTranscript,
  onRetranscribe,
  onRemoveTranscript,
  onExportSrt,
  mediaId,
  onTranscriptEdited,
}: TranscriptPanelProps) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  // Clip selection: shift-click a second cue to extend the span, like a file list.
  const [clipFrom, setClipFrom] = useState<number | null>(null);
  const [clipTo, setClipTo] = useState<number | null>(null);
  // Shift-click is the shortcut, but nothing advertised it. This toggle makes plain clicks
  // set the span instead of seeking, so the feature is discoverable without a keyboard.
  const [clipMode, setClipMode] = useState(false);
  const timed = transcripts.find((t) => t.segments.length > 0) ?? null;
  // A transcript with no timestamps (rare) can't drive the synced viewer — show its raw text.
  const fallbackText = !timed ? (transcripts[0]?.text ?? null) : null;
  const q = search.trim().toLowerCase();
  const segments = timed
    ? q === ""
      ? timed.segments
      : timed.segments.filter((s) => s.text.toLowerCase().includes(q))
    : [];
  // Active index is computed over the FULL segment list (playback position is absolute),
  // then matched by start time within the filtered view.
  const activeStart = timed
    ? (timed.segments[activeSegmentIndex(timed.segments, currentTime)]?.start ??
      null)
    : null;

  // Cue index by identity, built once. The rendered list can be search-filtered, so a row
  // cannot use its position in `segments` — and a findIndex per row is O(n^2) on a
  // two-hour transcript.
  const indexByKey = useMemo(() => {
    const m = new Map<string, number>();
    timed?.segments.forEach((s, i) => m.set(`${s.start}-${s.end}`, i));
    return m;
  }, [timed]);
  // Normalised span: clicking the end above the start is a reversed selection, not an
  // invalid one — ClipBar already reads it min/max, so the list must mark it the same way.
  const clipLo =
    clipFrom === null ? null : Math.min(clipFrom, clipTo ?? clipFrom);
  const clipHi =
    clipFrom === null ? null : Math.max(clipFrom, clipTo ?? clipFrom);

  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeStart]);

  const busy = transcribeMode !== null;
  const whisperPct =
    transcriptRatio === null ? 0 : Math.round(transcriptRatio * 100);
  // The filled primary is spent on the ONE state where fetching is the job: no transcript yet.
  // With a transcript already listed below it, a saturated "Get transcript" pointed the panel's
  // strongest weight at work that is already done — so both routes demote to peer secondaries.
  const hasTranscript = transcripts.length > 0;

  return (
    // flex-1 without min-h-0: the panel fills the card, but its automatic minimum size still
    // floors at the fixed rows (actions, source list, search) so nothing can be clipped —
    // only the segment list, which carries its own min-h-0 and scrolls, gives up height.
    <div className="flex flex-1 flex-col gap-4">
      {/* Empty: one filled CTA plus the Whisper alternative as a ghost. Populated: two peers,
          "Re-fetch" and "Re-transcribe with Whisper", at the same secondary weight. */}
      <div className="flex flex-none flex-wrap items-center gap-2">
        <Button
          data-testid="media-detail-get-transcript"
          size={hasTranscript ? "sm" : "default"}
          variant={hasTranscript ? "ghost" : "default"}
          className={hasTranscript ? GHOST_BUTTON : undefined}
          disabled={busy}
          onClick={onGetTranscript}
        >
          <Captions
            className={hasTranscript ? "h-3.5 w-3.5" : "h-4 w-4"}
            aria-hidden
          />
          {transcribeMode === "captions"
            ? transcriptStageLabel(transcriptStage)
            : hasTranscript
              ? "Re-fetch"
              : "Get transcript"}
        </Button>
        {canRetranscribe && (
          <Button
            size="sm"
            variant="ghost"
            className={GHOST_BUTTON}
            data-testid="media-detail-retranscribe"
            disabled={busy}
            onClick={onRetranscribe}
          >
            <AudioLines className="h-3.5 w-3.5" aria-hidden />
            {transcribeMode === "whisper"
              ? transcriptStageLabel(transcriptStage)
              : "Re-transcribe with Whisper"}
          </Button>
        )}
        {timed && (
          <Button
            size="sm"
            variant="ghost"
            className={
              clipMode
                ? "border border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                : GHOST_BUTTON
            }
            data-testid="transcript-clip-mode"
            aria-pressed={clipMode}
            data-active={clipMode ? "true" : undefined}
            onClick={() => {
              setClipMode((on) => !on);
              if (clipMode) {
                setClipFrom(null);
                setClipTo(null);
              }
            }}
          >
            <Scissors className="h-3.5 w-3.5" aria-hidden />
            {clipMode ? "Selecting clip…" : "Select clip"}
          </Button>
        )}
      </div>

      {/* Whisper progress — only the transcribe stage reports a ratio (audio extract is quick). */}
      {transcribeMode === "whisper" && transcriptRatio !== null && (
        <div
          data-testid="transcript-progress"
          className="flex-none rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3"
        >
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary/70">
              Whisper
            </span>
            <span className="text-[11px] font-medium tabular-nums text-foreground/70">
              {whisperPct}%
            </span>
          </div>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${whisperPct}%` }}
            />
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {transcriptStageLabel(transcriptStage)}
          </p>
        </div>
      )}

      {/* Source transcripts — one compact removable row each (no duplicated full-text block).
          Every control on the row shares the h-9 inline height token. */}
      {transcripts.length > 0 && (
        <div className="flex-none overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
          {transcripts.map((t) => (
            <div
              key={t.id}
              data-testid="media-detail-transcript"
              className="flex flex-wrap items-center gap-2.5 border-b border-white/[0.05] px-3.5 py-2.5 last:border-b-0"
            >
              {/* Same record, same grammar as the Files tab's Transcripts row: the language is
                  the row's NAME (prose, 14px/500), the source is a `code` marker trailing it, and
                  the raw registry slug is a key that never surfaces as copy. It read `CAPTIONS`
                  `EN` here and "English  CAPTIONS" one tab away — one record, two vocabularies,
                  two orderings. This is also the transcript length's single home; the status line
                  at the foot of the panel used to print the same number a second time. */}
              <span className="truncate text-sm font-medium text-foreground">
                {languageName(t.language)}
              </span>
              <Badge variant="code">
                {transcriptProviderLabel(t.providerId)}
              </Badge>
              {t.segments.length > 0 && (
                <span className="text-[12px] tabular-nums text-muted-foreground">
                  {t.segments.length} lines
                </span>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className={GHOST_BUTTON}
                  data-testid={`transcript-export-srt-${t.id}`}
                  disabled={busy || t.segments.length === 0}
                  onClick={() => onExportSrt(t.id)}
                >
                  Export .srt
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={GHOST_BUTTON}
                  data-testid={`transcript-edit-${t.id}`}
                  disabled={busy || t.segments.length === 0}
                  onClick={() =>
                    setEditingId((cur) => (cur === t.id ? null : t.id))
                  }
                >
                  <Pencil aria-hidden className="mr-1.5 h-3.5 w-3.5" />
                  {editingId === t.id ? "Close editor" : "Edit"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="media-detail-transcript-remove"
                  onClick={() => onRemoveTranscript(t.id)}
                  className={DANGER_GHOST_BUTTON}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingId !== null &&
        (() => {
          const target = transcripts.find((t) => t.id === editingId);
          return target ? (
            <TranscriptEditor
              transcript={target}
              onCancel={() => setEditingId(null)}
              onSaved={() => {
                setEditingId(null);
                onTranscriptEdited?.();
              }}
            />
          ) : null;
        })()}

      {timed && clipFrom !== null && (
        <ClipBar
          mediaId={mediaId}
          cues={timed.segments}
          fromIndex={clipFrom}
          toIndex={clipTo ?? clipFrom}
          onClear={() => {
            setClipFrom(null);
            setClipTo(null);
          }}
        />
      )}

      {timed && editingId === null && (
        <div className="flex min-h-0 flex-1 flex-col gap-2.5">
          <div className="relative flex-none">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/35"
            />
            <Input
              data-testid="media-detail-transcript-search"
              type="search"
              placeholder="Search transcript…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 border-white/10 pl-11"
            />
          </div>
          {/* Long list: hairlines only. No per-row shadow, no backdrop-filter, no blur —
              those forced a full-surface repaint on every scroll. The list takes every pixel
              the panel can give it (flex-1) so the status line under it stays tethered to the
              rows it counts instead of floating at the card floor over ~200px of nothing.
              The max-height only bites in the stacked (sub-lg) layout, where the panel has no
              bounded height of its own to hand down. */}
          <div className="scroll-thin min-h-0 max-h-[420px] flex-1 overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02] lg:max-h-none">
            {segments.map((seg) => {
              const active = seg.start === activeStart;
              const idx = indexByKey.get(`${seg.start}-${seg.end}`) ?? -1;
              const inClip =
                clipLo !== null &&
                clipHi !== null &&
                idx >= clipLo &&
                idx <= clipHi;
              const edge = inClip && (idx === clipLo || idx === clipHi);
              const edgeLabel =
                !edge || clipLo === null
                  ? null
                  : clipLo === clipHi
                    ? "Start · pick the end"
                    : idx === clipLo
                      ? "Start"
                      : "End";
              return (
                <button
                  key={`${seg.start}-${seg.end}`}
                  ref={active ? activeRef : undefined}
                  type="button"
                  data-testid="media-detail-transcript-segment"
                  data-active={active ? "true" : undefined}
                  onClick={(e) => {
                    // Shift-click extends the clip span in either mode; with "Select clip"
                    // on, a plain click does the same. Off, a plain click seeks, which is
                    // what this list has always done and must keep doing.
                    const index = timed.segments.findIndex(
                      (s) => s.start === seg.start && s.end === seg.end,
                    );
                    if ((e.shiftKey || clipMode) && index >= 0) {
                      if (clipFrom === null) setClipFrom(index);
                      else setClipTo(index);
                      return;
                    }
                    onSeek(seg.start);
                  }}
                  data-clip={edge ? "edge" : inClip ? "inside" : undefined}
                  className={`flex w-full items-baseline gap-3 border-b border-l-2 border-b-white/[0.05] px-3.5 py-2.5 text-left text-sm leading-relaxed transition-colors last:border-b-0 ${
                    active
                      ? "border-l-primary bg-primary/[0.10] text-foreground"
                      : inClip
                        ? // The span the clip covers, marked on every row it spans — a
                          // selection you can only see in the bar below it is a selection
                          // you have to take on trust.
                          `border-l-primary/50 bg-primary/[0.05] text-foreground ${edge ? "bg-primary/[0.09]" : ""}`
                        : "border-l-transparent text-foreground/85 hover:bg-white/[0.035] hover:text-foreground"
                  }`}
                >
                  {/* The UI face with tabular figures, not a mono stack — the mono numerals
                      were visibly chunkier and lower-quality than everything around them. */}
                  <span
                    className={`w-12 flex-none text-right text-[12px] tabular-nums ${
                      active || inClip
                        ? "font-medium text-primary"
                        : "text-fg-subtle"
                    }`}
                  >
                    {formatTimestamp(seg.start)}
                  </span>
                  <span className="min-w-0">
                    {edgeLabel && (
                      // Named, not just tinted: which end of the span a row is cannot be
                      // read off a shade, and "pick the end" is the only prompt that says
                      // the selection is half-made.
                      <span
                        data-testid="transcript-clip-edge"
                        className="mr-2 inline-flex items-center rounded-full border border-primary/35 bg-primary/15 px-1.5 align-[1px] text-[10px] font-semibold uppercase leading-4 tracking-[0.06em] text-primary"
                      >
                        {edgeLabel}
                      </span>
                    )}
                    {seg.text}
                  </span>
                </button>
              );
            })}
            {segments.length === 0 && (
              <p className="px-3.5 py-8 text-center text-[13px] text-muted-foreground">
                No matching lines.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Status line — hugged to the list, never pinned to the card floor: it describes the
          rows directly above it, so `mt-auto` used to strand it under 200px of empty surface.
          It carries an INSTRUCTION, not a count: the transcript's length already has exactly one
          home, the source row 400px above ("2 lines" beside the CAPTIONS/EN badges), and printing
          the same number twice in one panel made the reader check whether they disagreed. The
          only number that appears here is the one the source row cannot show — how many lines
          survived the search filter, which is a different fact about a different set. */}
      {timed && (
        <p className="-mt-1 flex-none border-t border-white/[0.06] pt-3 text-[12px] leading-5 text-muted-foreground">
          {clipMode
            ? "Click a line to set the clip start, then another for the end. Select clip again to stop."
            : !hasPlayer
              ? "Download this video to jump to a line in the player."
              : q === ""
                ? "Click a line to jump the player. Shift-click two lines to select a clip."
                : `${segments.length} matching ${segments.length === 1 ? "line" : "lines"} — click one to jump the player.`}
        </p>
      )}

      {fallbackText && (
        <p className="scroll-thin max-h-[420px] min-h-0 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm leading-relaxed text-foreground/90">
          {fallbackText}
        </p>
      )}

      {transcripts.length === 0 && (
        <div className={`${EMPTY_BOX} flex-1 justify-center`}>
          <span className={EMPTY_CHIP} aria-hidden>
            <Captions className="h-4 w-4" />
          </span>
          <p className="text-[13px] font-semibold text-foreground">
            No transcript yet.
          </p>
          <p className="max-w-[38ch] text-[13px] leading-relaxed text-muted-foreground">
            Get one from captions, or re-transcribe a downloaded video with
            Whisper.
          </p>
        </div>
      )}
    </div>
  );
}
