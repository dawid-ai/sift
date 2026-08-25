import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import type { ExportPreset } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";

const PRESETS: { value: ExportPreset; label: string; hint: string }[] = [
  {
    value: "markdown",
    label: "Markdown",
    hint: "Summaries and timed transcript",
  },
  { value: "pdf", label: "PDF", hint: "Printable, self-contained" },
  { value: "html", label: "HTML", hint: "One standalone page" },
  { value: "json", label: "JSON", hint: "Everything, machine-readable" },
  {
    value: "csv",
    label: "CSV chapters",
    hint: "One row per cue, for a spreadsheet",
  },
  {
    value: "obsidian",
    label: "Obsidian bundle",
    hint: "Folder with frontmatter and links",
  },
];

/**
 * Export-format picker for one library item.
 *
 * A menu rather than six buttons in the header: the formats are alternatives, only one is
 * chosen at a time, and the header already carries the actions that are not alternatives.
 * Follows the same focus-out and Escape closing as `FilterSelect`, so the two behave alike.
 */
export function ExportMenu({ mediaId }: { mediaId: number }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportPreset | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function run(preset: ExportPreset) {
    setBusy(preset);
    setError(null);
    setMessage(null);
    setOpen(false);
    try {
      const result = await window.sift.export.preset(mediaId, preset);
      setMessage(result.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <Button
        size="sm"
        variant="ghost"
        data-testid="export-menu-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={busy !== null}
        onClick={() => setOpen((v) => !v)}
      >
        <Download aria-hidden className="h-3.5 w-3.5" />
        {busy ? "Exporting…" : "Export"}
        <ChevronDown aria-hidden className="h-3.5 w-3.5" />
      </Button>

      {open && (
        <div
          role="listbox"
          aria-label="Export format"
          data-testid="export-menu"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              setOpen(false);
          }}
          className="absolute right-0 z-30 mt-1 w-[17rem] rounded-xl border border-white/10 bg-surface-2 p-1 shadow-xl"
        >
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="option"
              aria-selected={false}
              data-testid={`export-preset-${p.value}`}
              className="flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.06]"
              onClick={() => void run(p.value)}
            >
              <span className="text-[13px] text-foreground">{p.label}</span>
              <span className="text-[11px] text-foreground/50">{p.hint}</span>
            </button>
          ))}
        </div>
      )}

      {(message ?? error) && (
        <p
          data-testid="export-message"
          className={`absolute right-0 top-full mt-1 w-[24rem] break-all rounded-lg border px-2.5 py-1.5 text-[11px] ${
            error
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-white/10 bg-surface-2 text-foreground/75"
          }`}
        >
          {error ?? (
            <button
              type="button"
              className="text-left underline-offset-2 hover:underline"
              onClick={() => void window.sift.export.reveal(message!)}
            >
              Wrote {message}
            </button>
          )}
        </p>
      )}
    </div>
  );
}
