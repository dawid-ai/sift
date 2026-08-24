import { useEffect, useState } from "react";
import { FolderPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsError, SettingsHint } from "./settings-page";

/**
 * Folders that are scanned for media to import.
 *
 * Non-recursive, and the hint says so: a watch folder is a drop box, and recursing would turn
 * pointing one at a home directory into a full-library import nobody asked for.
 */
export function WatchFoldersSection() {
  const [folders, setFolders] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.sift.watchFolders
      .list()
      .then(setFolders)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function persist(next: string[]) {
    setBusy(true);
    setError(null);
    try {
      setFolders(await window.sift.watchFolders.set(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    setError(null);
    try {
      const picked = await window.sift.watchFolders.pick();
      if (!picked || folders?.includes(picked)) return;
      await persist([...(folders ?? []), picked]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function scanNow() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const imported = await window.sift.watchFolders.scan();
      setStatus(
        imported.length > 0
          ? `Imported ${imported.length} ${imported.length === 1 ? "file" : "files"}.`
          : "Nothing new to import.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!folders) return null;

  return (
    <div className="flex flex-col gap-3" data-testid="watch-folders-section">
      {folders.length === 0 ? (
        <SettingsHint data-testid="watch-folders-empty">
          No folders watched yet.
        </SettingsHint>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {folders.map((folder) => (
            <li
              key={folder}
              data-testid="watch-folder-row"
              className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2"
            >
              <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">
                {folder}
              </code>
              <button
                type="button"
                aria-label={`Stop watching ${folder}`}
                data-testid="watch-folder-remove"
                className="text-foreground/40 hover:text-danger"
                disabled={busy}
                onClick={() =>
                  void persist(folders.filter((f) => f !== folder))
                }
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Button
          data-testid="watch-folder-add"
          disabled={busy}
          onClick={() => void add()}
        >
          <FolderPlus aria-hidden className="mr-2 h-4 w-4" />
          Watch a folder
        </Button>
        {folders.length > 0 && (
          <Button
            variant="ghost"
            data-testid="watch-folder-scan"
            disabled={busy}
            onClick={() => void scanNow()}
          >
            Scan now
          </Button>
        )}
      </div>

      {status && (
        <SettingsHint data-testid="watch-folder-status">{status}</SettingsHint>
      )}
      <SettingsHint>
        Media dropped into a watched folder is imported automatically and tagged{" "}
        <code className="font-mono text-foreground/75">watched</code>. Files are
        left where they are, never copied or moved. Subfolders are not scanned,
        and a file is only imported once it has finished copying.
      </SettingsHint>
      {error && <SettingsError>{error}</SettingsError>}
    </div>
  );
}
