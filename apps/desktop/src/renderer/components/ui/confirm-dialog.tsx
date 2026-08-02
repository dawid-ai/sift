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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      data-testid={testId}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && <div className="mt-2 text-sm text-foreground/70">{description}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" data-testid="confirm-cancel" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button data-testid="confirm-ok" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
