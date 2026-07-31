import type { UpdateState } from "@/lib/update-state";
import { Button } from "@/components/ui/button";

function statusText(state: UpdateState): string {
  switch (state.kind) {
    case "checking":
      return "Checking…";
    case "not-available":
      return "You're up to date.";
    case "available":
      return `Update available (v${state.version}) — see the prompt.`;
    case "downloading":
      return `Downloading… ${Math.round(state.percent)}%`;
    case "downloaded":
      return "Downloaded — restart to install.";
    case "error":
      return state.message;
    default:
      return "";
  }
}

/** Settings section: an on-demand update check. The available→install flow is handled
 * by the toast; this shows checking/up-to-date/error feedback inline. */
export function UpdatesSection({ updateState }: { updateState: UpdateState }) {
  return (
    <div className="flex flex-col gap-3" data-testid="updates-section">
      <p className="text-sm text-muted-foreground">Check for a new version of Sift.</p>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          data-testid="settings-check-updates"
          onClick={() => void window.sift.updates.check()}
        >
          Check for updates
        </Button>
        <span className="text-sm text-muted-foreground">{statusText(updateState)}</span>
      </div>
    </div>
  );
}
