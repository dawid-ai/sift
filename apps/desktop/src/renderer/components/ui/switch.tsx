import { cn } from "@/lib/utils";

/** Mobile-style on/off toggle. Accessible (role=switch, keyboard-operable as a button). */
export function Switch({
  checked,
  onChange,
  disabled,
  id,
  "data-testid": testId,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  "data-testid"?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      data-testid={testId}
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        // The one control that still dims rather than recolours, deliberately. Button's
        // disabled skin is a tokenized fill + `--fg-disabled` ink, because a dead button's
        // problem was a *label* greyed twice over; a switch has no label — its whole meaning
        // is which way the track is filled, and repainting that fill neutral would delete the
        // on/off reading from a control that is disabled but still ON. Dimming keeps the
        // state legible and the deadness obvious. No filter — see the perf note in globals.css.
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none",
        // On: the warm CTA gradient with a top bevel. Off: a recessed track — the inset
        // shadow is what tells it apart from a plain rounded rectangle at rest.
        checked
          ? "border-transparent bg-gradient-to-r from-primary to-primary-lit shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.22)]"
          : "border-border bg-foreground/[0.07] shadow-[inset_0_1px_2px_0_hsl(0_0%_0%/0.4)] hover:border-border-strong hover:bg-foreground/[0.11]",
      )}
    >
      <span
        className={cn(
          "inline-block h-[18px] w-[18px] transform rounded-full shadow-[0_1px_2px_0_hsl(0_0%_0%/0.45)]",
          "transition-transform duration-150 ease-out",
          checked
            ? "translate-x-[22px] bg-white"
            : "translate-x-[2px] bg-foreground/60",
        )}
      />
    </button>
  );
}
