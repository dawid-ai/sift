import { useEffect, useState } from "react";
import { Check, FileDown } from "lucide-react";
import type { SummaryRecord } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CHIP_SHELL, ChipDot } from "@/components/tag-chip";
import {
  CHIP_STRONG,
  RAISED_CARD,
  SECTION_LABEL,
  SECTION_PAD,
  WELL,
  useVerticalOverflow,
} from "@/routes/home/preview-card";
import { cn } from "@/lib/utils";

export interface SummaryPanelProps {
  /** Live-accumulating streamed text for the in-flight request. */
  text: string;
  /** The persisted record once `summarize.start` resolves; null while streaming/empty. */
  summary: SummaryRecord | null;
  /** Exports the current `summary` and resolves the absolute .md path written. */
  onExport: () => Promise<string>;
}

/** Read-only presentational panel rendering a streamed/stored summary + export control. */
export function SummaryPanel({ text, summary, onExport }: SummaryPanelProps) {
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setExportPath(null);
    setExportError(null);
  }, [summary?.id]);

  // Declared above the early return: hooks run in the same order on every render.
  const { ref: wellRef, overflows } = useVerticalOverflow<HTMLDivElement>();

  const content = summary?.text ?? text;
  if (!content) return null;

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const path = await onExport();
      setExportPath(path);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card data-testid="summary-panel" className={cn("w-full", RAISED_CARD)}>
      <header
        className={cn(
          SECTION_PAD,
          "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-foreground/[0.07]",
        )}
      >
        <div className="min-w-0">
          {/* The section label carries the heading role — same eyebrow rung as every other
              section on this route. */}
          <p className={SECTION_LABEL}>SUMMARY</p>
          <p className="mt-2 text-[13px] leading-none text-muted-foreground">
            Generated from the transcript
          </p>
        </div>
        {/* One chip shell at readable contrast, meaning carried by a leading dot: coral =
            live/active, none = plain fact. Mono is reserved for values you could copy — the
            model id qualifies, the provider's name doesn't. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {summary ? (
            <>
              <span className={cn(CHIP_SHELL, CHIP_STRONG)}>
                {summary.providerId}
              </span>
              <span
                className={cn(
                  CHIP_SHELL,
                  CHIP_STRONG,
                  "font-mono tracking-normal",
                )}
              >
                {summary.model}
              </span>
            </>
          ) : (
            <span className={cn(CHIP_SHELL, CHIP_STRONG)}>
              <ChipDot
                color="hsl(var(--primary))"
                halo="hsl(var(--primary) / 0.24)"
                className="motion-safe:animate-pulse"
              />
              Streaming
            </span>
          )}
        </div>
      </header>

      <div className={SECTION_PAD}>
        {/* Reading well: the deepest surface on the route, so the prose sits in a well instead
            of floating on the panel. Gutter reserved so long output doesn't shift the text;
            the bottom fade appears only once there is genuinely something beneath it. */}
        <div className="relative">
          <div
            ref={wellRef}
            className={cn(
              WELL,
              "max-h-80 overflow-y-auto px-4 py-3.5 [scrollbar-gutter:stable]",
            )}
          >
            <p
              data-testid="summary-content"
              className="whitespace-pre-wrap text-[13.5px] leading-[1.7] text-foreground/85"
            >
              {content}
              {!summary && (
                <span
                  aria-hidden
                  className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] bg-primary motion-safe:animate-pulse"
                />
              )}
            </p>
          </div>
          {/* Same rule as the transcript well: gated on real overflow, and 32px so it can
              never cover a full line box. A gradient painted over the last readable line of a
              well that has nothing left to scroll is a contrast loss in exchange for a signal
              that is false. */}
          {overflows && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-px bottom-px h-8 rounded-b-xl bg-gradient-to-t from-[#0C0A09] via-[#0C0A09]/75 to-transparent"
            />
          )}
        </div>

        {summary && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <Button
              data-testid="summary-export"
              size="sm"
              variant="outline"
              disabled={exporting}
              onClick={() => void handleExport()}
            >
              <FileDown aria-hidden className="h-4 w-4" />
              {exporting ? "Exporting…" : "Export"}
            </Button>
            {exportPath && (
              <span
                data-testid="summary-export-path"
                title={exportPath}
                className={cn(
                  CHIP_SHELL,
                  CHIP_STRONG,
                  // A file path is exactly what monospace is for.
                  "h-7 min-w-0 max-w-full px-3 font-mono tracking-normal",
                )}
              >
                <Check aria-hidden className="h-3 w-3 shrink-0 text-success" />
                <span className="truncate">{exportPath}</span>
              </span>
            )}
          </div>
        )}

        {exportError && (
          <p className="mt-3 rounded-xl border border-danger/25 bg-danger/12 px-3.5 py-2.5 text-sm text-danger">
            {exportError}
          </p>
        )}
      </div>
    </Card>
  );
}
