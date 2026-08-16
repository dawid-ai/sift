import type { ReactNode } from "react";
import { AlertTriangle, ArrowUpCircle, CheckCircle2, DownloadCloud, RefreshCw } from "lucide-react";
import type { UpdateState } from "@/lib/update-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Tone maps onto the accent discipline: amber for the actionable moment, green for done,
 * red for failed. Nothing here invents a fourth colour. */
export type ToastTone = "primary" | "success" | "danger";

const CHIP: Record<ToastTone, string> = {
  primary: "border-primary/25 bg-primary/12 text-primary",
  success: "border-success/25 bg-success/12 text-success",
  danger: "border-danger/25 bg-danger/12 text-danger",
};

/** The label is a micro-header, not the accent. For the neutral case the coral is already
 * spent on the icon chip and the CTA, so the eyebrow goes monochrome; a status tone is a
 * claim about what happened, so success/failure keep their hue. */
const EYEBROW: Record<ToastTone, string> = {
  primary: "text-muted-foreground",
  success: "text-success",
  danger: "text-danger",
};

/** A whisper of the tone around the whole card, so a failed update doesn't sit in a frame
 * whose only edge colour says warm-amber "everything is fine".
 *
 * Deliberately an `outline`, not a `ring`: Tailwind's ring utilities rewrite `box-shadow`,
 * which would wipe out `.panel-lit`'s warm outer glow. A -1px offset lands the outline
 * exactly on the panel's own hairline, tinting it instead of drawing a second edge. */
export const PANEL_TONE: Record<ToastTone, string> = {
  primary: "",
  success: "outline outline-1 -outline-offset-1 outline-success/30",
  danger: "outline outline-1 -outline-offset-1 outline-danger/30",
};

/** The frame every toast in this folder shares: rim-lit panel, opaque fill (it floats over
 * live content), bottom-right, one width. Exported so the binary toast is the same object. */
export const TOAST_PANEL = [
  "panel-lit bg-surface p-5",
  "animate-in fade-in-0 slide-in-from-bottom-2 duration-200 motion-reduce:animate-none",
].join(" ");

/**
 * The action group every toast state ends with: a full-bleed hairline separating chrome
 * from content (the reference's nested-surface language — never a drop shadow), then one
 * filled CTA plus one outline dismiss. Both buttons share a shell so the pair reads as one
 * group instead of a button next to a piece of bare text.
 */
export const TOAST_ACTIONS = "-mx-5 mt-4 flex items-center gap-2 border-t border-border/70 px-5 pt-3.5";

/**
 * Icon chip · eyebrow · headline — the reference's "eyebrow + big numeral" block, shrunk to
 * toast scale. Every state uses it, so the card doesn't reflow as the update morphs from
 * available → downloading → downloaded. Presentation only.
 */
export function ToastHead({
  icon,
  label,
  tone = "primary",
  children,
}: {
  icon: ReactNode;
  label: string;
  tone?: ToastTone;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "grid h-9 w-9 flex-none place-items-center rounded-xl border",
          "shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.08)]",
          CHIP[tone],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("eyebrow", EYEBROW[tone])}>{label}</p>
        {/* The label is the caption and the slot below is the figure — at 22px the number
            needs the extra 2px of air or the two lines read as one crushed block. */}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  );
}

/** The headline slot: a version or a percentage, set as the hero numeral — twice the
 * eyebrow's size, so the card has a figure and a caption rather than two captions. */
export function ToastNumber({ children }: { children: ReactNode }) {
  return (
    <p className="text-[22px] font-bold leading-none tracking-[-0.025em] tabular-nums text-foreground">
      {children}
    </p>
  );
}

/** A thin track + warm gradient fill. `testId` lands on the fill, which is what the update
 * spec waits on. A null percent (no Content-Length yet) is an indeterminate sliver that
 * breathes, rather than a dead 0% bar. */
export function ToastProgress({
  percent,
  testId,
}: {
  percent: number | null;
  testId?: string;
}) {
  return (
    <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
      <div
        data-testid={testId}
        className={cn(
          "h-full rounded-full bg-gradient-to-r from-primary to-primary-lit",
          percent === null
            ? "animate-pulse motion-reduce:animate-none"
            : "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        )}
        style={{ width: percent === null ? "15%" : `${percent}%` }}
      />
    </div>
  );
}

/** Bottom-right non-blocking update prompt. Morphs across the update lifecycle.
 * Renders nothing for idle/checking/not-available (those surface in Settings). */
export function UpdateToast({ state, onDismiss }: { state: UpdateState; onDismiss: () => void }) {
  if (state.kind === "idle" || state.kind === "checking" || state.kind === "not-available") {
    return null;
  }
  // Presentation only — which of the three accents this card is allowed to use.
  const tone: ToastTone =
    state.kind === "downloaded" ? "success" : state.kind === "error" ? "danger" : "primary";
  return (
    <div
      data-testid="update-toast"
      className={cn("fixed bottom-4 right-4 z-50 w-[22rem]", TOAST_PANEL, PANEL_TONE[tone])}
    >
      {state.kind === "available" && (
        <>
          <ToastHead
            label="Update available"
            icon={<ArrowUpCircle className="h-[18px] w-[18px]" aria-hidden />}
          >
            <ToastNumber>v{state.version}</ToastNumber>
          </ToastHead>
          {state.releaseNotes && (
            // Nested surface, one step lighter + a hairline — never a drop shadow.
            <div className="mt-3.5 rounded-xl border border-border bg-surface-2/70 px-3 py-2.5 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.04)]">
              <p className="eyebrow text-muted-foreground">Release notes</p>
              <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {state.releaseNotes}
              </p>
            </div>
          )}
          <div className={TOAST_ACTIONS}>
            <Button size="sm" data-testid="update-toast-now" onClick={() => void window.sift.updates.download()}>
              <DownloadCloud className="h-3.5 w-3.5" aria-hidden />
              Update now
            </Button>
            <Button size="sm" variant="outline" data-testid="update-toast-later" onClick={onDismiss}>
              Later
            </Button>
          </div>
        </>
      )}
      {state.kind === "downloading" && (
        <>
          <ToastHead
            label="Downloading update"
            icon={<DownloadCloud className="h-[18px] w-[18px]" aria-hidden />}
          >
            <ToastNumber>{Math.round(state.percent)}%</ToastNumber>
          </ToastHead>
          <ToastProgress percent={Math.round(state.percent)} testId="update-toast-progress" />
        </>
      )}
      {state.kind === "downloaded" && (
        <>
          <ToastHead
            tone="success"
            label="Ready to install"
            icon={<CheckCircle2 className="h-[18px] w-[18px]" aria-hidden />}
          >
            <ToastNumber>v{state.version}</ToastNumber>
          </ToastHead>
          <p className="mt-3.5 text-[12px] leading-5 text-muted-foreground">
            The update installs when the app restarts.
          </p>
          <div className={TOAST_ACTIONS}>
            <Button size="sm" data-testid="update-toast-restart" onClick={() => void window.sift.updates.install()}>
              Restart now
            </Button>
            <Button size="sm" variant="outline" onClick={onDismiss}>
              Later
            </Button>
          </div>
        </>
      )}
      {state.kind === "error" && (
        <>
          <ToastHead
            tone="danger"
            label="Update failed"
            icon={<AlertTriangle className="h-[18px] w-[18px]" aria-hidden />}
          >
            <p className="text-[13px] leading-relaxed text-muted-foreground">{state.message}</p>
          </ToastHead>
          <div className={TOAST_ACTIONS}>
            <Button size="sm" onClick={() => void window.sift.updates.check()}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Retry
            </Button>
            <Button size="sm" variant="outline" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
