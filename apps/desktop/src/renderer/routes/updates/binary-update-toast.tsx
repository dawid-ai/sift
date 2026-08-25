import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpCircle,
  CheckCircle2,
  DownloadCloud,
} from "lucide-react";
import type { BinaryKind, BinaryProgress } from "@sift/ipc-contract";
import type { BinaryUpdateState } from "@/lib/binary-update-state";
import { Button } from "@/components/ui/button";
import { chipClass } from "@/components/tag-chip";
// Same frame, head, progress bar and action group as the app-update toast — the two stack
// in the same corner, so they have to read as one family rather than two people's work.
import {
  PANEL_TONE,
  TOAST_ACTIONS,
  TOAST_PANEL,
  ToastHead,
  ToastNumber,
  ToastProgress,
  type ToastTone,
} from "./update-toast";

const LABELS: Record<BinaryKind, string> = {
  ytdlp: "yt-dlp",
  ffmpeg: "ffmpeg",
  deno: "Deno",
};

/**
 * Monospaced version chip. The before→after read is carried by hue, not by a decoration:
 * what you have is a neutral white-alpha chip, what is on offer is the warm `accent` chip.
 * Two grey pills either side of an arrow said nothing; grey → warm says which one is new
 * without a single extra word.
 */
function VersionPill({
  children,
  next = false,
}: {
  children: string;
  next?: boolean;
}) {
  return (
    <span
      className={chipClass(
        next ? "accent" : "neutral",
        "font-mono tabular-nums tracking-normal",
      )}
    >
      {children}
    </span>
  );
}

export function BinaryUpdateToast({
  state,
  onDismiss,
}: {
  state: BinaryUpdateState;
  onDismiss: (kind: BinaryKind) => void;
}) {
  const [progress, setProgress] = useState<
    Partial<Record<BinaryKind, BinaryProgress>>
  >({});
  useEffect(
    () =>
      window.sift.binaries.onProgress((p) =>
        setProgress((prev) => ({ ...prev, [p.kind]: p })),
      ),
    [],
  );

  const notices = (Object.keys(state) as BinaryKind[])
    .map((k) => state[k])
    .filter((n): n is NonNullable<typeof n> => n !== undefined);
  if (notices.length === 0) return null;

  return (
    <div
      className="flex w-full flex-col gap-2.5"
      data-testid="binary-update-toast"
    >
      {notices.map((n) => {
        const label = LABELS[n.kind];
        const p = progress[n.kind];
        const percent =
          p && p.total
            ? Math.min(100, Math.round((p.received / p.total) * 100))
            : null;
        // Presentation only — which of the three accents this card is allowed to use.
        const tone: ToastTone =
          n.type === "ready"
            ? "success"
            : n.type === "error"
              ? "danger"
              : "primary";
        return (
          <div
            key={n.kind}
            data-testid={`binary-update-toast-${n.kind}`}
            className={`${TOAST_PANEL} ${PANEL_TONE[tone]}`}
          >
            {n.type === "installing" && (
              <>
                <ToastHead
                  label={`Updating ${label}…`}
                  icon={
                    <DownloadCloud className="h-[18px] w-[18px]" aria-hidden />
                  }
                >
                  {percent !== null && <ToastNumber>{percent}%</ToastNumber>}
                </ToastHead>
                <ToastProgress percent={percent} />
              </>
            )}
            {n.type === "ready" && (
              <>
                <ToastHead
                  tone="success"
                  label={
                    n.reason === "installed"
                      ? `${label} installed`
                      : `Updated ${label}`
                  }
                  icon={
                    <CheckCircle2 className="h-[18px] w-[18px]" aria-hidden />
                  }
                >
                  {n.version ? <ToastNumber>{n.version}</ToastNumber> : null}
                </ToastHead>
                <div className={TOAST_ACTIONS}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDismiss(n.kind)}
                  >
                    Dismiss
                  </Button>
                </div>
              </>
            )}
            {n.type === "available" && (
              <>
                <ToastHead
                  label={`${label} update available`}
                  icon={
                    <ArrowUpCircle className="h-[18px] w-[18px]" aria-hidden />
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <VersionPill>{n.installedVersion}</VersionPill>
                    <ArrowRight
                      className="h-3.5 w-3.5 flex-none text-foreground/45"
                      aria-hidden
                    />
                    <VersionPill next>{n.latestVersion}</VersionPill>
                  </div>
                </ToastHead>
                <div className={TOAST_ACTIONS}>
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
                    <DownloadCloud className="h-3.5 w-3.5" aria-hidden />
                    Update
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDismiss(n.kind)}
                  >
                    Later
                  </Button>
                </div>
              </>
            )}
            {n.type === "error" && (
              <>
                <ToastHead
                  tone="danger"
                  label={`${label} update failed`}
                  icon={
                    <AlertTriangle className="h-[18px] w-[18px]" aria-hidden />
                  }
                >
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {n.message}
                  </p>
                </ToastHead>
                <div className={TOAST_ACTIONS}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDismiss(n.kind)}
                  >
                    Dismiss
                  </Button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
