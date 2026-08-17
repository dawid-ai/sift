import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { filterOptions, type FilterOption } from "@/lib/filter-options";

export interface FilterSelectProps {
  /** Current selection; `null` means "no filter" (the `allLabel` row). */
  value: string | null;
  onChange: (value: string | null) => void;
  options: FilterOption[];
  /** Label of the reset row, e.g. "All channels". */
  allLabel: string;
  /** Goes on the trigger button; the query box is `${testId}-search`. */
  testId: string;
  className?: string;
}

/** A `<select>` with a filter box inside the dropdown. */
export function FilterSelect({
  value,
  onChange,
  options,
  allLabel,
  testId,
  className,
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // The reset row is just another option, so filtering treats it uniformly.
  const shown = filterOptions(
    [{ value: "", label: allLabel }, ...options],
    query,
  );
  const label = options.find((o) => o.value === value)?.label ?? allLabel;

  function pick(next: string) {
    onChange(next || null);
    setQuery("");
    setOpen(false);
  }

  function close() {
    setQuery("");
    setOpen(false);
  }

  return (
    <div
      className={cn("relative", className)}
      // ponytail: focus-out + Escape close it. No outside-click listener — the
      // options are real buttons, so blur covers pointer and keyboard alike.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <button
        type="button"
        data-testid={testId}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[13px] transition-colors duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "shadow-bevel",
          // A set filter is a live constraint, so it gets a *selected* treatment — a lighter
          // fill and full-strength label — not the accent. It used to read amber, which put
          // a fourth coral element on a toolbar that already had one primary action; the
          // accent is reserved for that action. Both states share the Button `outline` shell
          // so a filter row and a button row sit on one optical baseline.
          value
            ? "border-foreground/[0.16] bg-foreground/[0.09] text-foreground"
            : "border-border bg-surface-2/80 text-muted-foreground hover:border-border-strong hover:text-foreground",
        )}
      >
        <span className="max-w-[12rem] truncate">{label}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        // Opaque, and a step lighter than the panel it floats over: a popover that lets the
        // page read through it is the fastest way to lose the surface hierarchy.
        <div className="absolute left-0 z-20 mt-1.5 w-64 rounded-2xl border border-border-strong bg-surface-2 p-1.5 shadow-pop">
          <input
            ref={searchRef}
            data-testid={`${testId}-search`}
            type="search"
            value={query}
            placeholder="Filter…"
            aria-label={`Filter ${allLabel.toLowerCase()}`}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              const first = shown[0];
              if (e.key === "Enter" && first) {
                e.preventDefault();
                pick(first.value);
              }
            }}
            className={cn(
              // Recessed against the popover's own surface-2 — a field has to sit *below* the
              // sheet it's on, not level with it.
              "mb-1.5 h-9 w-full rounded-lg border border-border bg-background/60 px-2.5 text-[13px] text-foreground",
              "shadow-[inset_0_1px_2px_0_hsl(0_0%_0%/0.35)]",
              "placeholder:text-placeholder",
              "focus:border-primary/55 focus:outline-none focus:ring-2 focus:ring-primary/20",
              "focus-visible:ring-primary/45",
              "[&::-webkit-search-cancel-button]:cursor-pointer [&::-webkit-search-cancel-button]:opacity-45 [&::-webkit-search-cancel-button]:invert",
            )}
          />
          {/* `.scroll-thin` (= `.scrollbar-thin`), not the page bar: this scroller is inside a
              16px-radius popover, and the app-wide bar runs its thumb straight into the
              popover's own hairline. One shared definition in globals.css rather than a
              per-file copy — the same one media-detail and the library transcript pane use. */}
          <div role="listbox" className="scroll-thin max-h-60 overflow-y-auto">
            {shown.map((o) => {
              const selected = (value ?? "") === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-testid={`${testId}-option`}
                  onClick={() => pick(o.value)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                    // Same low-key selected language as the trigger above — the checkmark
                    // is what says "chosen", not a colour.
                    selected
                      ? "bg-foreground/[0.09] text-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
                  )}
                >
                  <Check
                    aria-hidden
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                </button>
              );
            })}
            {shown.length === 0 && (
              <p className="px-2.5 py-2 text-[13px] text-muted-foreground">
                No matches
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
