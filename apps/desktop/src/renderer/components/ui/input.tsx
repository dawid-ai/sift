import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Chromium paints `<input type="date">` as an `mm/dd/yyyy` stub with a black calendar glyph
 * that vanishes on a dark surface, and `type="search"` gets an equally invisible black ✕.
 * Both need explicit treatment or the field looks unfinished. Presentation only — the
 * element, its type and every forwarded prop are untouched.
 */
const DATE_LIKE = [
  "[&::-webkit-calendar-picker-indicator]:cursor-pointer",
  "[&::-webkit-calendar-picker-indicator]:opacity-50",
  "[&::-webkit-calendar-picker-indicator]:invert",
  "[&::-webkit-calendar-picker-indicator]:transition-opacity",
  "hover:[&::-webkit-calendar-picker-indicator]:opacity-90",
  "[&::-webkit-datetime-edit]:leading-none",
  "[&::-webkit-datetime-edit-text]:px-0.5",
  "[&::-webkit-datetime-edit-text]:text-placeholder",
  "[&::-webkit-datetime-edit-fields-wrapper]:p-0",
].join(" ");

const SEARCH_LIKE = [
  "[&::-webkit-search-cancel-button]:cursor-pointer",
  "[&::-webkit-search-cancel-button]:opacity-45",
  "[&::-webkit-search-cancel-button]:invert",
  "hover:[&::-webkit-search-cancel-button]:opacity-80",
].join(" ");

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-11 w-full rounded-xl border border-border bg-surface-2/80 px-3.5 py-2 text-sm text-foreground",
        "shadow-[inset_0_1px_2px_0_hsl(0_0%_0%/0.35)]",
        "transition-colors duration-150 ease-out",
        // A placeholder is instructional text — it says what the field is for — so it gets
        // its own token rather than the dimmest available alpha. At 14px on a recessed
        // surface the old `foreground/40` measured well under the 4.5:1 floor. `--placeholder`
        // now resolves to the muted rung (5.25:1 on this field's fill), which is also the rung
        // the filter labels sitting beside a search field use: two resting labels of the same
        // class, 9px apart, no longer render one legible and one under AA.
        "placeholder:text-placeholder",
        "hover:border-border-strong",
        // Two rings on purpose. `focus:` is the soft amber wash a mouse click gets; the
        // `focus-visible:` pair is the keyboard indicator and has to be unmistakable — the
        // old single ring at 15% alpha was, in practice, no focus indicator at all.
        "focus:border-primary/55 focus:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary/20",
        "focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-primary/45",
        // Disabled reads as disabled from its own token, not from a blanket opacity that
        // dimmed a live field and a dead one to indistinguishable greys.
        "disabled:cursor-not-allowed disabled:bg-surface-2/40 disabled:text-fg-disabled disabled:placeholder:text-fg-disabled",
        (type === "date" || type === "datetime-local" || type === "month" || type === "time") &&
          DATE_LIKE,
        type === "search" && SEARCH_LIKE,
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
