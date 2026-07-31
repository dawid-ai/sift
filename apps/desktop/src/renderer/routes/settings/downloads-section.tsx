import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-col gap-3" data-testid="downloads-section">
      <p className="text-sm text-foreground/60">
        Where downloaded videos are saved.
      </p>
      <div className="flex items-center gap-2">
        <code
          data-testid="downloads-path"
          className="flex-1 truncate rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
        >
          {path ?? (error ? "—" : "Loading…")}
        </code>
        <Button data-testid="downloads-change" variant="outline" onClick={() => void change()}>
          Change…
        </Button>
      </div>
      <p className="text-xs text-foreground/50">
        Changing this affects only new downloads — already-downloaded videos stay in their current folder.
      </p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
