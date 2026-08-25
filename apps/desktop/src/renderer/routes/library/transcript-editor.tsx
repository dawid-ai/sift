import { useMemo, useState } from "react";
import { Check, Merge, RotateCcw, Trash2, Undo2 } from "lucide-react";
import {
  countMatches,
  mergeWithPrevious,
  removeSegment,
  replaceAll,
  segmentsEqual,
  setSegmentText,
  setSegmentTimes,
  setSpeaker,
  shiftTimes,
  speakerOf,
  textWithoutSpeaker,
} from "@sift/core";
import type { TranscriptCue, TranscriptRecord } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTimestamp } from "@/lib/transcript-view";
import { cn } from "@/lib/utils";

/**
 * Editing view for one transcript: find/replace, per-cue text, speaker labels, and timing.
 *
 * Every edit runs through the pure helpers in `@sift/core`, and each result is pushed onto an
 * undo stack held here. Nothing is written until Save, so the user can experiment — a
 * find/replace across a two-hour transcript is exactly the operation you want to be able to
 * take back.
 */
export function TranscriptEditor({
  transcript,
  onCancel,
  onSaved,
}: {
  transcript: TranscriptRecord;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const original = useMemo<TranscriptCue[]>(
    () => transcript.segments.map((s) => ({ ...s })),
    [transcript],
  );
  const [cues, setCues] = useState<TranscriptCue[]>(original);
  const [history, setHistory] = useState<TranscriptCue[][]>([]);
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [shift, setShift] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = !segmentsEqual(cues, original);
  const matches = countMatches(cues, find, { caseSensitive, wholeWord });

  /** Every mutation goes through here, so undo covers all of them uniformly. */
  function apply(next: TranscriptCue[]) {
    if (next === cues) return;
    setHistory((h) => [...h.slice(-49), cues]);
    setCues(next);
  }

  function undo() {
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (prev) setCues(prev);
      return h.slice(0, -1);
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await window.sift.transcript.update(transcript.id, cues);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="transcript-editor">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-black/25 p-2.5">
        <Input
          data-testid="editor-find"
          aria-label="Find"
          className="h-9 w-[11rem] text-[12px]"
          placeholder="Find…"
          value={find}
          onChange={(e) => setFind(e.target.value)}
        />
        <Input
          data-testid="editor-replace"
          aria-label="Replace with"
          className="h-9 w-[11rem] text-[12px]"
          placeholder="Replace with…"
          value={replace}
          onChange={(e) => setReplace(e.target.value)}
        />
        <Button
          variant="ghost"
          className="h-9 px-2.5 text-[12px]"
          data-testid="editor-replace-all"
          disabled={!find || matches.occurrences === 0}
          onClick={() =>
            apply(replaceAll(cues, find, replace, { caseSensitive, wholeWord }))
          }
        >
          Replace all
        </Button>
        <span
          data-testid="editor-match-count"
          className="text-[12px] tabular-nums text-foreground/55"
        >
          {find ? `${matches.occurrences} in ${matches.segments} cues` : " "}
        </span>
        <label className="flex items-center gap-1.5 text-[12px] text-foreground/70">
          <input
            type="checkbox"
            data-testid="editor-case"
            className="h-3.5 w-3.5 accent-primary"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          Match case
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-foreground/70">
          <input
            type="checkbox"
            data-testid="editor-whole-word"
            className="h-3.5 w-3.5 accent-primary"
            checked={wholeWord}
            onChange={(e) => setWholeWord(e.target.checked)}
          />
          Whole word
        </label>

        <span className="mx-1 h-5 w-px bg-white/10" aria-hidden />

        {/* Shifting every cue is the fix for a track that runs early or late as a whole,
            which is the common caption defect; per-cue nudging is below. */}
        <label className="flex items-center gap-1.5 text-[12px] text-foreground/70">
          Shift all
          <Input
            type="number"
            step="0.1"
            data-testid="editor-shift-seconds"
            aria-label="Shift every cue by seconds"
            className="h-9 w-[5.5rem] text-[12px]"
            value={shift}
            onChange={(e) => setShift(e.target.value)}
          />
          s
        </label>
        <Button
          variant="ghost"
          className="h-9 px-2.5 text-[12px]"
          data-testid="editor-shift-apply"
          disabled={!Number.isFinite(Number(shift)) || Number(shift) === 0}
          onClick={() => apply(shiftTimes(cues, Number(shift)))}
        >
          Apply
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            className="h-9 px-2.5 text-[12px]"
            data-testid="editor-undo"
            disabled={history.length === 0}
            onClick={undo}
          >
            <Undo2 aria-hidden className="mr-1.5 h-3.5 w-3.5" />
            Undo
          </Button>
          <Button
            variant="ghost"
            className="h-9 px-2.5 text-[12px]"
            data-testid="editor-revert"
            disabled={!dirty}
            onClick={() => apply(original)}
          >
            <RotateCcw aria-hidden className="mr-1.5 h-3.5 w-3.5" />
            Revert
          </Button>
          <Button
            variant="ghost"
            className="h-9 px-2.5 text-[12px]"
            data-testid="editor-cancel"
            onClick={onCancel}
          >
            Close
          </Button>
          <Button
            className="h-9 px-3 text-[12px]"
            data-testid="editor-save"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            <Check aria-hidden className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-[12px] text-danger" data-testid="editor-error">
          {error}
        </p>
      )}

      <ul className="scroll-thin flex max-h-[28rem] flex-col gap-1.5 overflow-y-auto pr-1">
        {cues.map((cue, i) => {
          const speaker = speakerOf(cue) ?? "";
          return (
            <li
              key={i}
              data-testid="editor-cue"
              className="flex flex-col gap-1.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]"
            >
              {/* ponytail: stacked, not a fixed-column grid. The row lives in the detail
                  page's narrow right column (~430px), where four fixed columns left the
                  textarea ~40px wide and it rendered one word per line. Stacking works at
                  400px and at 1200px without a second layout. */}
              <div className="flex flex-wrap items-center gap-2">
                {/* One start control, not two: the number input is seconds, and the
                    m:ss beside it is the same value formatted. They used to sit on
                    separate lines with no label between them. */}
                <label className="flex flex-none items-center gap-1.5 text-[11px] text-foreground/55">
                  Start
                  <Input
                    type="number"
                    step="0.1"
                    aria-label={`Start of cue ${i + 1} in seconds`}
                    data-testid="editor-cue-start"
                    className="h-8 w-[5.5rem] text-[11px] tabular-nums"
                    value={cue.start}
                    onChange={(e) =>
                      apply(
                        setSegmentTimes(
                          cues,
                          i,
                          Number(e.target.value),
                          cue.end,
                        ),
                      )
                    }
                  />
                  <span className="tabular-nums text-foreground/35">
                    s · {formatTimestamp(cue.start)}
                  </span>
                </label>
                <Input
                  aria-label={`Speaker for cue ${i + 1}`}
                  data-testid="editor-cue-speaker"
                  className="h-8 w-[9rem] flex-none text-[11px]"
                  placeholder="Speaker"
                  value={speaker}
                  onChange={(e) => apply(setSpeaker(cues, i, e.target.value))}
                />
                <div className="ml-auto flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-label={`Merge cue ${i + 1} into the one before it`}
                    data-testid="editor-cue-merge"
                    disabled={i === 0}
                    className="rounded-md p-1 text-foreground/35 hover:text-foreground disabled:opacity-30"
                    onClick={() => apply(mergeWithPrevious(cues, i))}
                  >
                    <Merge aria-hidden className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete cue ${i + 1}`}
                    data-testid="editor-cue-delete"
                    className="rounded-md p-1 text-foreground/35 hover:text-danger"
                    onClick={() => apply(removeSegment(cues, i))}
                  >
                    <Trash2 aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <textarea
                aria-label={`Text of cue ${i + 1}`}
                data-testid="editor-cue-text"
                rows={2}
                className={cn(
                  "min-h-8 w-full resize-y rounded-lg border border-border bg-surface-2/80 px-2.5 py-1.5",
                  "text-[12px] leading-relaxed text-foreground",
                )}
                value={textWithoutSpeaker(cue)}
                onChange={(e) =>
                  apply(
                    setSegmentText(
                      cues,
                      i,
                      speaker
                        ? `${speaker}: ${e.target.value}`
                        : e.target.value,
                    ),
                  )
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
