import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One keystroke to anywhere: Ctrl+K opens a filtered list of everything the app can do
 * from the keyboard, plus whatever the query itself implies — a pasted URL becomes
 * "Fetch this URL", any other text becomes "Search the library for …".
 *
 * Deliberately not a dependency. A palette is a filtered list, an input, and arrow keys;
 * cmdk and friends bring a headless-UI stack to do that.
 */

export interface Command {
  id: string;
  /** What the row reads. */
  label: string;
  /** Second line, when the label alone doesn't say enough. */
  detail?: string;
  /** Extra words to match on that aren't in the label ("prefs" for Settings). */
  keywords?: string;
  /** Shown right-aligned, e.g. "Ctrl+1". */
  shortcut?: string;
  icon?: ReactNode;
  /** Query-derived commands only. `lead` puts the row above the matching commands (a pasted
   * URL is almost certainly what you meant); `trail` puts it below them, so an exact command
   * match still wins over a generic "search for this". Default is `lead`. */
  position?: "lead" | "trail";
  run: () => void;
}

/** Case-insensitive subsequence match — "lib" and "lbry" both hit "Open library". Cheap,
 * and forgiving of the letters people actually drop when typing fast. */
export function matches(query: string, haystack: string): boolean {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return true;
  const h = haystack.toLowerCase();
  let i = 0;
  for (const char of h) {
    if (char === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

export function filterCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) return commands;
  return commands.filter((c) =>
    matches(query, `${c.label} ${c.keywords ?? ""} ${c.detail ?? ""}`),
  );
}

export function CommandPalette({
  open,
  onClose,
  commands,
  dynamic,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  /** Commands built from the query itself — "fetch this URL", "search the library for …".
   * They are appended unfiltered, since the query is what produced them. */
  dynamic?: (query: string) => Command[];
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    const derived = dynamic?.(query) ?? [];
    return [
      ...derived.filter((c) => c.position !== "trail"),
      ...filterCommands(commands, query),
      ...derived.filter((c) => c.position === "trail"),
    ];
  }, [commands, dynamic, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    // A frame's delay: the input is mounted by this same render.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  // Escape closes from anywhere, not just from the input: focus can land on a row after a
  // mouse move, and a modal that only closes while one specific element has focus is a trap.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  // Keep the highlighted row on screen when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  const run = (command: Command | undefined): void => {
    if (!command) return;
    onClose();
    command.run();
  };

  return createPortal(
    <div
      data-testid="command-palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.10] bg-[#12100F] shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4">
          <Search aria-hidden className="h-4 w-4 flex-none text-primary" />
          <input
            ref={inputRef}
            data-testid="command-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, paste a URL, or search your library…"
            aria-label="Command"
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(shown[index]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {shown.length === 0 && (
            <p
              data-testid="command-palette-empty"
              className="px-4 py-6 text-center text-sm text-muted-foreground"
            >
              Nothing matches “{query}”.
            </p>
          )}
          {shown.map((c, i) => (
            <button
              key={c.id}
              type="button"
              data-testid="command-palette-item"
              data-command={c.id}
              data-active={i === index}
              onMouseMove={() => setIndex(i)}
              onClick={() => run(c)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-2.5 text-left",
                i === index ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
              )}
            >
              {c.icon && (
                <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-white/[0.05] text-foreground/60 [&_svg]:h-3.5 [&_svg]:w-3.5">
                  {c.icon}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-foreground">
                  {c.label}
                </span>
                {c.detail && (
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {c.detail}
                  </span>
                )}
              </span>
              {c.shortcut && (
                <kbd className="flex-none rounded-md border border-white/10 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {c.shortcut}
                </kbd>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
