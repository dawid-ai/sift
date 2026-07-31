import type { UpdateState } from "@/lib/update-state";
import { Button } from "@/components/ui/button";

/** Bottom-right non-blocking update prompt. Morphs across the update lifecycle.
 * Renders nothing for idle/checking/not-available (those surface in Settings). */
export function UpdateToast({ state, onDismiss }: { state: UpdateState; onDismiss: () => void }) {
  if (state.kind === "idle" || state.kind === "checking" || state.kind === "not-available") {
    return null;
  }
  return (
    <div
      data-testid="update-toast"
      className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-border bg-surface p-4 shadow-glow"
    >
      {state.kind === "available" && (
        <>
          <p className="text-sm font-semibold text-foreground">Update available — v{state.version}</p>
          {state.releaseNotes && (
            <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {state.releaseNotes}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" data-testid="update-toast-now" onClick={() => void window.sift.updates.download()}>
              Update now
            </Button>
            <Button size="sm" variant="ghost" data-testid="update-toast-later" onClick={onDismiss}>
              Later
            </Button>
          </div>
        </>
      )}
      {state.kind === "downloading" && (
        <>
          <p className="text-sm font-semibold text-foreground">Downloading update…</p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              data-testid="update-toast-progress"
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.round(state.percent)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{Math.round(state.percent)}%</p>
        </>
      )}
      {state.kind === "downloaded" && (
        <>
          <p className="text-sm font-semibold text-foreground">Ready to install — v{state.version}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" data-testid="update-toast-restart" onClick={() => void window.sift.updates.install()}>
              Restart now
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Later
            </Button>
          </div>
        </>
      )}
      {state.kind === "error" && (
        <>
          <p className="text-sm font-semibold text-danger">Update failed</p>
          <p className="mt-1 text-xs text-muted-foreground">{state.message}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void window.sift.updates.check()}>
              Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
