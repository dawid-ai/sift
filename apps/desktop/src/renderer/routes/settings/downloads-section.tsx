import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsError, SettingsHint } from "./settings-page";

/** Shows the current download folder and lets the user change it via the OS folder picker. */
export function DownloadsSection() {
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.sift.downloads.getPath().then(setPath).catch((e) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, []);

  async function change() {
    setError(null);
    try {
      const chosen = await window.sift.downloads.pickPath();
      if (chosen === null) return;
      await window.sift.downloads.setPath(chosen);
      const saved = await window.sift.downloads.getPath();
      setPath(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div data-testid="downloads-section">
      {/* Field + button are both 44px (control-md) — one height, one radius. */}
      <div className="flex items-center gap-2">
        {/* The path field reads as an input, but it isn't one — the OS picker is the only
            way to change it, so it's a read-only surface with the same shell. */}
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-white/[0.07] bg-black/25 px-3.5">
          {/* /45, the same alpha the Platforms search glyph uses. A leading field glyph is
              non-text UI and has a 3:1 floor; at /30 on this recessed well it measured
              2.5:1 and read as a smudge. */}
          <FolderOpen aria-hidden className="h-4 w-4 shrink-0 text-foreground/45" />
          <code
            data-testid="downloads-path"
            className="min-w-0 truncate font-mono text-[13px] tracking-tight text-foreground"
          >
            {path ?? (error ? "—" : "Loading…")}
          </code>
        </div>
        <Button
          data-testid="downloads-change"
          variant="outline"
          size="lg"
          onClick={() => void change()}
        >
          Change…
        </Button>
      </div>
      <SettingsHint className="mt-2.5">
        Changing this affects only new downloads — already-downloaded videos stay in their current
        folder.
      </SettingsHint>
      {error && (
        <div className="mt-3">
          <SettingsError>{error}</SettingsError>
        </div>
      )}
    </div>
  );
}
