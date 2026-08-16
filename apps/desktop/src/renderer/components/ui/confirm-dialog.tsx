import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Minimal in-app confirmation modal (no dependency). Click-outside or Escape cancels. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  "data-testid": testId,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  "data-testid"?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      // Scrim is a flat alpha wash — no backdrop-filter, which would repaint the whole
      // window behind it every frame the dialog is open.
      className="fixed inset-0 z-50 flex items-center justify-center bg-[hsl(20_30%_2%/0.72)] p-4"
      role="dialog"
      aria-modal="true"
      data-testid={testId}
      onClick={onCancel}
    >
      <div
        // bg-surface-2 (opaque) overrides .panel-lit's translucent fill — a modal must not
        // let the page read through it, and it sits at the top of the surface ladder because
        // it is the frontmost thing on screen.
        className="panel-lit w-full max-w-sm bg-surface-2 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="eyebrow">CONFIRM</p>
        <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">{title}</h3>
        {description && (
          <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" size="sm" data-testid="confirm-cancel" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button size="sm" data-testid="confirm-ok" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
