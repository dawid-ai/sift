import { useState } from "react";
import { Archive, HeartPulse, Upload } from "lucide-react";
import { branding } from "@sift/core";
import type { MissingFileInfo, VerifyLibraryResult } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { SettingsError, SettingsHint } from "./settings-page";

/**
 * Backup, restore, and the missing-files scan.
 *
 * Restore stages rather than overwrites, and the copy explains why: the database is open
 * while the app runs, and swapping it underneath a live connection corrupts both files.
 */
export function BackupSection() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [verified, setVerified] = useState<VerifyLibraryResult | null>(null);

  async function run(key: string, work: () => Promise<string | null>) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      const text = await work();
      if (text) setMessage(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const backup = () =>
    run("backup", async () => {
      const result = await window.sift.backup.create();
      return result
        ? `Wrote ${result.manifest.counts.media} media rows to ${result.path}`
        : null;
    });

  const restore = () =>
    run("restore", async () => {
      const found = await window.sift.backup.inspect();
      if (!found) return null;
      const staged = await window.sift.backup.restore(found.path);
      return (
        `Staged ${staged.manifest.counts.media} media rows from ${found.manifest.createdAt.slice(0, 10)}. ` +
        `Quit ${branding.appName}, then rename ${staged.stagedDatabase} to drop the ".restored" suffix — ` +
        `and the same for ${staged.stagedSettings.length} settings files.`
      );
    });

  const verify = () =>
    run("verify", async () => {
      const result = await window.sift.backup.verify();
      setVerified(result);
      return result.missing.length === 0
        ? `Checked ${result.checked} files. Everything is where it should be.`
        : `Checked ${result.checked} files. ${result.missing.length} are missing.`;
    });

  const repair = (missing: MissingFileInfo[], useSearchDir: boolean) =>
    run("repair", async () => {
      const result = await window.sift.backup.repair(missing, useSearchDir);
      setVerified(null);
      return `Relinked ${result.relinked}, marked ${result.marked} as missing.`;
    });

  return (
    <div className="flex flex-col gap-3" data-testid="backup-section">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          data-testid="backup-create"
          disabled={busy !== null}
          onClick={() => void backup()}
        >
          <Archive aria-hidden className="mr-2 h-4 w-4" />
          {busy === "backup" ? "Backing up…" : "Back up library"}
        </Button>
        <Button
          variant="ghost"
          data-testid="backup-restore"
          disabled={busy !== null}
          onClick={() => void restore()}
        >
          <Upload aria-hidden className="mr-2 h-4 w-4" />
          Restore from a backup
        </Button>
        <Button
          variant="ghost"
          data-testid="backup-verify"
          disabled={busy !== null}
          onClick={() => void verify()}
        >
          <HeartPulse aria-hidden className="mr-2 h-4 w-4" />
          {busy === "verify" ? "Scanning…" : "Check for missing files"}
        </Button>
      </div>

      {message && (
        <SettingsHint
          data-testid="backup-message"
          className="text-foreground/80"
        >
          {message}
        </SettingsHint>
      )}

      {verified && verified.missing.length > 0 && (
        <div
          data-testid="missing-files"
          className="flex flex-col gap-2 rounded-xl border border-danger/25 bg-danger/[0.07] p-3"
        >
          <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {verified.missing.slice(0, 50).map((m) => (
              <li key={m.downloadId} className="text-[12px] text-foreground/80">
                <span className="text-foreground">{m.title}</span>{" "}
                <code className="font-mono text-[11px] text-foreground/45">
                  {m.path}
                </code>
              </li>
            ))}
          </ul>
          {verified.missing.length > 50 && (
            <p className="text-[11px] text-foreground/50">
              …and {verified.missing.length - 50} more.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              className="h-8 px-2.5 text-[12px]"
              data-testid="repair-search"
              disabled={busy !== null}
              onClick={() => void repair(verified.missing, true)}
            >
              Look in another folder…
            </Button>
            <Button
              variant="ghost"
              className="h-8 px-2.5 text-[12px]"
              data-testid="repair-mark"
              disabled={busy !== null}
              onClick={() => void repair(verified.missing, false)}
            >
              Mark them as missing
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-foreground/55">
            Marking keeps the library rows, their transcripts, and their
            summaries — only the download is flagged, so the video can be
            fetched again into the same entry.
          </p>
        </div>
      )}

      <SettingsHint>
        A backup holds the library database and your settings, not the media
        files: those are the bulk of the bytes, already sit wherever you keep
        them, and can be downloaded again. API keys are not included, because
        they are encrypted for this machine and would not open elsewhere.
      </SettingsHint>
      {error && <SettingsError>{error}</SettingsError>}
    </div>
  );
}
