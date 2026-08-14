export interface DropOverlayProps {
  dragging: boolean;
  busy: string | null;
  error: string | null;
}

/** Full-window drag affordance plus the import status line. Rendered by App() so a file
 * can be dropped from any view. */
export function DropOverlay({ dragging, busy, error }: DropOverlayProps) {
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
        <p data-testid="import-busy" role="status" className="px-4 pt-2 text-sm text-foreground/60">
          Importing {busy}…
        </p>
      )}
      {error && (
        <p data-testid="import-error" className="px-4 pt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
