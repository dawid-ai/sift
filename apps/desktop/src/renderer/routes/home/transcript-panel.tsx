import type { TranscriptRecord } from "@sift/ipc-contract";
import { CardLit } from "@/components/ui/card";
import { CHIP_SHELL } from "@/components/tag-chip";
import {
  CHIP_STRONG,
  RAISED_CARD_LIT,
  SECTION_LABEL,
  SECTION_PAD,
  WELL,
  formatDuration,
  useVerticalOverflow,
} from "@/routes/home/preview-card";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/copy-button";

export interface TranscriptPanelProps {
  transcript: TranscriptRecord;
}

/** Read-only presentational panel rendering a fetched transcript. */
export function TranscriptPanel({ transcript }: TranscriptPanelProps) {
  const count = transcript.segments.length;
  const { ref: wellRef, overflows } = useVerticalOverflow<HTMLDivElement>();

  return (
    // The *lit* card — `.panel-lit`, the same object every other card on this route draws,
    // one rung up. A transcript arriving is the state change here, so this is the one surface
    // with a warm rim and an outer glow: the terminal state is legible before a single word is
    // read. The rim is the ladder's masked radial, not a line drawn across the top edge.
    <CardLit
      data-testid="transcript-panel"
      className={cn("w-full", RAISED_CARD_LIT)}
    >
      <header
        className={cn(
          SECTION_PAD,
          "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-foreground/[0.07]",
        )}
      >
        <div className="min-w-0">
          {/* The section label carries the heading role — same eyebrow rung as every other
              section on this route. */}
          <p className={SECTION_LABEL}>TRANSCRIPT</p>
          {/* A row count is a caption, not a title: it is set below the object title's weight
              and size, and it doesn't take a full stop. */}
          <p className="mt-2 text-[13px] leading-none tabular-nums text-muted-foreground">
            {count > 0
              ? `${count} timed segment${count === 1 ? "" : "s"}`
              : "Full text, untimed"}
          </p>
        </div>
        {/* One chip shell for every pill on this route, at readable contrast — metadata, not
            disabled chrome. Sans: a language code and a provider name are neither a URL, an
            id, nor a path, so neither is monospace. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {transcript.language && (
            <span
              className={cn(
                CHIP_SHELL,
                CHIP_STRONG,
                "uppercase tracking-[0.08em]",
              )}
            >
              {transcript.language}
            </span>
          )}
          <span className={cn(CHIP_SHELL, CHIP_STRONG)}>
            {transcript.providerId}
          </span>
          <CopyButton
            testId="transcript-copy"
            label="Copy"
            value={() => transcript.text}
          />
        </div>
      </header>

      {/* Reading well: the deepest surface on the route, sunk into the card plane the way the
          reference nests an inner panel inside a lit outer one. Rows carry hover colour only
          — a transcript can run to thousands of cues, so nothing per-row may trigger a
          repaint. The scrollbar gutter is reserved so the text doesn't shift left the moment
          the list overflows, and a bottom fade signals that more exists below — but only when
          more actually exists (see the overlay). */}
      <div className={SECTION_PAD}>
        <div className="relative">
          <div
            ref={wellRef}
            className={cn(
              WELL,
              "max-h-80 overflow-y-auto p-1.5 [scrollbar-gutter:stable]",
            )}
          >
            {count > 0 ? (
              <div className="flex flex-col">
                {transcript.segments.map((seg, i) => (
                  <div
                    key={`${seg.start}-${i}`}
                    data-testid="transcript-segment"
                    className="group/seg flex gap-3 rounded-lg px-2.5 py-1.5 transition-colors duration-150 ease-out hover:bg-foreground/[0.05]"
                  >
                    {/* /55 (not /45) keeps an 11px timestamp above 4.5:1 on this surface —
                        it's information, not decoration. */}
                    <span className="min-w-[3.25rem] shrink-0 pt-px text-right font-mono text-[11px] leading-5 tabular-nums text-foreground/55 transition-colors duration-150 ease-out group-hover/seg:text-primary">
                      {formatDuration(seg.start)}
                    </span>
                    <span className="min-w-0 flex-1 text-[13.5px] leading-5 text-foreground/85 transition-colors duration-150 ease-out group-hover/seg:text-foreground">
                      {seg.text}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="whitespace-pre-wrap px-2.5 py-1.5 text-[13.5px] leading-relaxed text-foreground/85">
                {transcript.text}
              </p>
            )}
          </div>
          {/* Gated on real overflow, and shorter than a line box. It used to be painted
              unconditionally at 40px, which reached far enough up to dim the *last* segment of
              a two-segment transcript — a well with empty space beneath it — to 4.06:1 on the
              well fill, under the 4.5:1 floor, to advertise content that wasn't there. It
              appears only when there is something below the fold, and at 32px it can no longer
              swallow a whole 20px line. */}
          {overflows && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-px bottom-px h-8 rounded-b-xl bg-gradient-to-t from-[#0C0A09] via-[#0C0A09]/75 to-transparent"
            />
          )}
        </div>
      </div>
    </CardLit>
  );
}
