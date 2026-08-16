import { RefreshCw } from "lucide-react";
import { branding } from "@sift/core";
import type { UpdateState } from "@/lib/update-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingRow, SettingsError } from "./settings-page";

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

/** Status pill tone. Presentation only — the strings above are unchanged.
 *
 * These used to be four hand-rolled class strings on a `rounded-full px-3 py-1 text-[12px]`
 * shell: a 26px pill with a 12px label, on a page whose every other pill is `Badge`'s 20px /
 * 11px box. `Badge` *is* the one pill geometry in this app, and its tinted `success` /
 * `warning` tones are the documented form for a status claim — so the tone map is now a
 * variant name rather than a fifth private palette. (`error` never reaches here; it goes to
 * SettingsError below.) */
function statusTone(state: UpdateState): "success" | "warning" | "neutral" {
  switch (state.kind) {
    case "not-available":
    case "downloaded":
      return "success";
    case "available":
      return "warning";
    default:
      return "neutral";
  }
}

/** Settings section: an on-demand update check. The available→install flow is handled
 * by the toast; this shows checking/up-to-date/error feedback inline. */
export function UpdatesSection({ updateState }: { updateState: UpdateState }) {
  const status = statusText(updateState);

  return (
    <div className="flex flex-col gap-3" data-testid="updates-section">
      <SettingRow
        label="Update check"
        hint={`Looks for a newer release of ${branding.appName}. Installing stays your call — a prompt appears when one is found.`}
      >
        <Button
          variant="outline"
          size="lg"
          data-testid="settings-check-updates"
          onClick={() => void window.sift.updates.check()}
        >
          <RefreshCw className="h-4 w-4" />
          Check for updates
        </Button>
      </SettingRow>
      {/* An update failure is a message, not a state pill: it is the only one of these
        strings that can run to a paragraph of network error, and a `whitespace-nowrap` pill
        would push it straight out of the card. It goes through the page's own error block,
        which is what every other failure on this surface uses. */}
      {updateState.kind === "error" ? (
        <SettingsError>{status}</SettingsError>
      ) : (
        status && (
          <Badge variant={statusTone(updateState)} dot className="w-fit">
            {status}
          </Badge>
        )
      )}
    </div>
  );
}
