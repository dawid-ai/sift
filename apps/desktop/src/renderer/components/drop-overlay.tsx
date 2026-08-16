import { AlertTriangle, ArrowDownToLine, FileAudio } from "lucide-react";
import { transcriptStageLabel } from "@/lib/transcript-stage-label";
import type { ImportProgress } from "@/lib/use-file-import";
import { CHIP_SHELL } from "@/components/tag-chip";
import { cn } from "@/lib/utils";

/** Tiled fractal-noise raster used as film grain over the drag scrim. Inline `data:` SVG —
 * `img-src` in the renderer CSP allows `data:`, so it needs no network and no asset file. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='140'%20height='140'%3E%3Cfilter%20id='g'%3E%3CfeTurbulence%20type='fractalNoise'%20baseFrequency='0.85'%20numOctaves='3'%20stitchTiles='stitch'/%3E%3C/filter%3E%3Crect%20width='140'%20height='140'%20filter='url(%23g)'/%3E%3C/svg%3E\")";

export interface DropOverlayProps {
  dragging: boolean;
  busy: ImportProgress | null;
  error: string | null;
}

/** Full-window drag affordance plus the import status card. Rendered by App() so a file
 * can be dropped from any view.
 *
 * The busy state is a solid fixed card, not an inline line of grey text: a Whisper run on
 * a long file is minutes of exactly this screen, and a faint static `<p>` in page flow read
 * as a frozen app. The moving percentage is the part that says "not frozen". */
export function DropOverlay({ dragging, busy, error }: DropOverlayProps) {
  const percent = busy?.ratio != null ? Math.round(Math.min(1, Math.max(0, busy.ratio)) * 100) : null;
  return (
    <>
      {dragging && (
        <div
          data-testid="drop-overlay"
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-8 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
        >
          {/* Flat alpha scrim + a warm bloom behind the target. Deliberately NOT a
              backdrop-blur: this covers the entire window, and blurring a full-window
              surface repaints every pixel behind it on each frame of the drag. */}
          <div aria-hidden className="absolute inset-0 bg-background/85" />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage: [
                // Key light behind the target…
                "radial-gradient(46% 46% at 50% 48%, hsl(18 95% 55% / 0.18) 0%, hsl(16 90% 50% / 0.05) 45%, transparent 72%)",
                // …and two low-amplitude sources so the corners are not dead flat black.
                "radial-gradient(90% 60% at 100% 100%, hsl(18 95% 60% / 0.05), transparent 70%)",
                "radial-gradient(70% 55% at 0% 0%, hsl(24 90% 55% / 0.06), transparent 68%)",
              ].join(","),
            }}
          />
          {/* 3% film grain so the black has tooth instead of reading as a void. A tiled
              raster, painted once — no filter, no animation, nothing per-frame. */}
          <div aria-hidden className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: GRAIN }} />
          <div className="corner-mark [--mark-inset:-7px] [--mark-size:11px] relative flex w-full max-w-[26rem] flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-primary/45 bg-surface/90 px-10 py-11 text-center shadow-[0_0_70px_-16px_hsl(18_95%_55%/0.45),0_30px_70px_-40px_hsl(0_0%_0%/0.9)] animate-in zoom-in-95 duration-150 motion-reduce:animate-none">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-primary/30 bg-primary/12 text-primary shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.1)]">
              <ArrowDownToLine className="h-6 w-6" strokeWidth={2} aria-hidden />
            </span>
            {/* The overlay's one coral moment is the eyebrow + icon chip; everything below
                is monochrome so the entry point is unambiguous. */}
            <div className="flex flex-col">
              <p className="eyebrow">Import</p>
              <p className="mt-2 text-[22px] font-bold leading-tight tracking-[-0.02em] text-foreground">
                Drop to transcribe
              </p>
              <p className="mx-auto mt-2.5 max-w-[34ch] text-[13px] leading-6 text-muted-foreground">
                Audio and video files land in your Library and are transcribed on this machine.
              </p>
            </div>
          </div>
        </div>
      )}
      {busy && (
        <div
          data-testid="import-busy"
          role="status"
          aria-live="polite"
          // Same width, padding, rim-lit frame and 36px icon chip as the update toasts —
          // all three stack in this corner and have to read as one family.
          className="panel-lit fixed bottom-4 right-4 z-40 w-[22rem] bg-surface p-5 animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-xl border border-primary/25 bg-primary/12 text-primary shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.08)]">
              <FileAudio className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                {/* Muted micro-header: the coral is already spent on the icon chip and the
                    progress fill — a third orange object in a 22rem card flattens all three. */}
                <p className="eyebrow text-muted-foreground">Importing</p>
                {busy.total > 1 && (
                  <span className={cn(CHIP_SHELL, "flex-none tabular-nums")}>
                    File {busy.index} of {busy.total}
                  </span>
                )}
              </div>
              <p
                className="mt-1.5 truncate text-[13px] font-medium text-foreground"
                title={busy.name}
              >
                {busy.name}
              </p>
            </div>
          </div>
          <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
            {/* No ratio yet (extracting audio, or a provider that doesn't report one) → an
                indeterminate sliver that still reads as "running", not a 0% bar. */}
            <div
              data-testid="import-progress"
              className={`h-full rounded-full bg-gradient-to-r from-primary to-primary-lit ${
                percent === null
                  ? "animate-pulse motion-reduce:animate-none"
                  : "transition-[width] duration-200 ease-out motion-reduce:transition-none"
              }`}
              style={{ width: percent === null ? "15%" : `${percent}%` }}
            />
          </div>
          {/* The numeral is the hero, not a footnote: the stage label is the 11px caption
              beneath it, the same ramp the reference uses for a stat tile. */}
          <p className="mt-2.5 flex items-baseline justify-between gap-3">
            <span className="truncate text-[11px] leading-4 text-muted-foreground">
              {transcriptStageLabel(busy.stage)}
            </span>
            {percent !== null && (
              <span className="flex-none text-[17px] font-bold leading-none tracking-[-0.02em] tabular-nums text-foreground">
                {percent}
                <span className="ml-0.5 text-[11px] font-semibold text-muted-foreground">%</span>
              </span>
            )}
          </p>
        </div>
      )}
      {error && (
        <p
          data-testid="import-error"
          role="alert"
          className="mx-6 mt-4 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/[0.08] px-4 py-3.5 text-[13px] leading-relaxed text-danger shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.05)]"
        >
          {/* Icon chip, not a loose glyph — the same tinted square the toasts open with, one
              step brighter than the block it sits in, so a failure in page flow and a failure
              in a toast are visibly the same object. */}
          <span className="grid h-7 w-7 flex-none place-items-center rounded-lg border border-danger/25 bg-danger/[0.16]">
            <AlertTriangle className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 pt-1">{error}</span>
        </p>
      )}
    </>
  );
}
