import { useEffect, useState } from "react";
import type { BinaryKind, BinaryProgress } from "@sift/ipc-contract";
import type { BinaryUpdateState } from "@/lib/binary-update-state";
import { Button } from "@/components/ui/button";

const LABELS: Record<BinaryKind, string> = { ytdlp: "yt-dlp", ffmpeg: "ffmpeg", deno: "Deno" };

export function BinaryUpdateToast({
  state,
  onDismiss,
}: {
  state: BinaryUpdateState;
  onDismiss: (kind: BinaryKind) => void;
}) {
  const [progress, setProgress] = useState<Partial<Record<BinaryKind, BinaryProgress>>>({});
  useEffect(() => window.sift.binaries.onProgress((p) => setProgress((prev) => ({ ...prev, [p.kind]: p }))), []);

  const notices = (Object.keys(state) as BinaryKind[])
    .map((k) => state[k])
    .filter((n): n is NonNullable<typeof n> => n !== undefined);
  if (notices.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" data-testid="binary-update-toast">
      {notices.map((n) => {
        const label = LABELS[n.kind];
        const p = progress[n.kind];
        const percent = p && p.total ? Math.min(100, Math.round((p.received / p.total) * 100)) : null;
        return (
          <div
            key={n.kind}
            data-testid={`binary-update-toast-${n.kind}`}
            className="rounded-lg border border-border bg-surface p-4 shadow-glow"
          >
            {n.type === "installing" && (
              <>
                <p className="text-sm font-semibold text-foreground">Updating {label}…</p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${percent ?? 15}%` }}
                  />
                </div>
              </>
            )}
            {n.type === "ready" && (
              <>
                <p className="text-sm font-semibold text-foreground">
                  {n.reason === "installed" ? `${label} installed` : `Updated ${label}`}
                  {n.version ? ` — ${n.version}` : ""}
                </p>
                <div className="mt-3">
                  <Button size="sm" variant="ghost" onClick={() => onDismiss(n.kind)}>Dismiss</Button>
                </div>
              </>
            )}
            {n.type === "available" && (
              <>
                <p className="text-sm font-semibold text-foreground">{label} update available</p>
                <p className="mt-1 text-xs text-muted-foreground">{n.installedVersion} → {n.latestVersion}</p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    data-testid={`binary-update-toast-${n.kind}-update`}
                    onClick={() => {
                      void (async () => {
                        try {
                          await window.sift.binaries.install(n.kind);
                          onDismiss(n.kind);
                        } catch (e) {
                          console.error(`Failed to update ${n.kind}`, e);
                        }
                      })();
                    }}
                  >
                    Update
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDismiss(n.kind)}>Later</Button>
                </div>
              </>
            )}
            {n.type === "error" && (
              <>
                <p className="text-sm font-semibold text-danger">{label} update failed</p>
                <p className="mt-1 text-xs text-muted-foreground">{n.message}</p>
                <div className="mt-3">
                  <Button size="sm" variant="ghost" onClick={() => onDismiss(n.kind)}>Dismiss</Button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
