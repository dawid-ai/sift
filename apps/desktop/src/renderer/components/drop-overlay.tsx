import { transcriptStageLabel } from "@/lib/transcript-stage-label";
import type { ImportProgress } from "@/lib/use-file-import";

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
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
        >
          <div className="rounded-xl border-2 border-dashed border-primary px-8 py-6 text-lg font-medium">
            Drop to transcribe
          </div>
        </div>
      )}
      {busy && (
        <div
          data-testid="import-busy"
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-40 w-80 rounded-xl border border-border bg-background p-4 shadow-xl"
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium">Importing</p>
            {busy.total > 1 && (
              <p className="flex-none text-xs tabular-nums text-foreground/60">
                File {busy.index} of {busy.total}
              </p>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-foreground/70" title={busy.name}>
            {busy.name}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
            {/* No ratio yet (extracting audio, or a provider that doesn't report one) → an
                indeterminate sliver that still reads as "running", not a 0% bar. */}
            <div
              data-testid="import-progress"
              className={`h-full rounded-full bg-primary ${percent === null ? "animate-pulse" : "transition-[width]"}`}
              style={{ width: percent === null ? "15%" : `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 flex justify-between gap-2 text-xs text-foreground/60">
            <span>{transcriptStageLabel(busy.stage)}</span>
            {percent !== null && <span className="tabular-nums">{percent}%</span>}
          </p>
        </div>
      )}
      {error && (
        <p data-testid="import-error" role="alert" className="px-4 pt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
