import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
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
  const shown = filterOptions([{ value: "", label: allLabel }, ...options], query);
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
        className="flex items-center gap-1 rounded border border-border bg-transparent px-2 py-1 text-sm"
      >
        <span className="max-w-[12rem] truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-60 rounded border border-border bg-surface p-1 shadow-lg">
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
            className="mb-1 w-full rounded border border-border bg-transparent px-2 py-1 text-sm"
          />
          <div role="listbox" className="max-h-60 overflow-y-auto">
            {shown.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={(value ?? "") === o.value}
                data-testid={`${testId}-option`}
                onClick={() => pick(o.value)}
                className={cn(
                  "block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-foreground/10",
                  (value ?? "") === o.value && "bg-foreground/10",
                )}
              >
                {o.label}
              </button>
            ))}
            {shown.length === 0 && (
              <p className="px-2 py-1 text-sm text-foreground/60">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
