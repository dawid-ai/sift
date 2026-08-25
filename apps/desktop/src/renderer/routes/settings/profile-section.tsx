import { useState } from "react";
import { Download, Upload } from "lucide-react";
import type { ProfileImportResult } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { SettingsError, SettingsHint } from "./settings-page";

/** Human-readable names for the setting keys a profile carries. Anything not listed is a key
 * from a different build, and is shown verbatim so the user can see what was ignored. */
const LABELS: Record<string, string> = {
  transcriptLanguages: "transcript languages",
  transcriptMethod: "transcript method",
  autoTranscript: "auto-transcript",
  aiDefault: "default AI model",
  downloadsPath: "downloads folder",
  queue: "queue",
  binaryUpdates: "binary updates",
  proxyUrl: "proxy",
  customEndpoint: "custom AI endpoint",
};

const label = (key: string): string => LABELS[key] ?? key;

function summarize(r: ProfileImportResult): string {
  const parts: string[] = [];
  parts.push(
    r.applied.length > 0
      ? `Applied ${r.applied.length} settings: ${r.applied.map(label).join(", ")}.`
      : "No settings applied.",
  );
  const prompts = r.promptsCreated + r.promptsReplaced;
  if (prompts > 0)
    parts.push(
      `${prompts} prompts (${r.promptsCreated} new, ${r.promptsReplaced} replaced).`,
    );
  if (r.skipped.length > 0)
    parts.push(`Skipped ${r.skipped.map(label).join(", ")}.`);
  if (r.promptsSkipped > 0)
    parts.push(`${r.promptsSkipped} prompt entries were malformed.`);
  return parts.join(" ");
}

/**
 * Exports and imports one JSON file holding every non-secret setting plus the user's own
 * prompts. Restart-free: the stores are read per use, so an imported value takes effect on
 * the next action rather than the next launch.
 */
export function ProfileSection() {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  async function run(which: "export" | "import") {
    setBusy(which);
    setError(null);
    setStatus(null);
    try {
      if (which === "export") {
        const path = await window.sift.profile.export();
        if (path) setStatus(`Saved to ${path}`);
      } else {
        const result = await window.sift.profile.import();
        if (result) setStatus(summarize(result));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="profile-section">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          data-testid="profile-export"
          disabled={busy !== null}
          onClick={() => void run("export")}
        >
          <Download aria-hidden className="mr-2 h-4 w-4" />
          {busy === "export" ? "Exporting…" : "Export profile"}
        </Button>
        <Button
          data-testid="profile-import"
          variant="ghost"
          disabled={busy !== null}
          onClick={() => void run("import")}
        >
          <Upload aria-hidden className="mr-2 h-4 w-4" />
          {busy === "import" ? "Importing…" : "Import profile"}
        </Button>
      </div>
      <SettingsHint>
        One file with every setting on this page plus your own prompts, for
        moving to another machine or restoring after a reinstall. API keys,
        sign-ins, and your library are not included — keys are encrypted for
        this machine, so a copy would not open anywhere else.
      </SettingsHint>
      {status && (
        <SettingsHint
          data-testid="profile-status"
          className="text-foreground/80"
        >
          {status}
        </SettingsHint>
      )}
      {error && <SettingsError>{error}</SettingsError>}
    </div>
  );
}
