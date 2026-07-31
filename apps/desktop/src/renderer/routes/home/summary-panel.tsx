import { useEffect, useState } from "react";
import type { SummaryRecord } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <Card data-testid="summary-panel" className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-foreground/70">Summary</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p
          data-testid="summary-content"
          className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm"
        >
          {content}
        </p>

        {summary && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid="summary-export"
              size="sm"
              variant="outline"
              disabled={exporting}
              onClick={() => void handleExport()}
            >
              {exporting ? "Exporting…" : "Export"}
            </Button>
            {exportPath && (
              <span data-testid="summary-export-path" className="text-xs text-foreground/60">
                {exportPath}
              </span>
            )}
          </div>
        )}

        {exportError && (
          <p className="text-sm text-red-600 dark:text-red-400">{exportError}</p>
        )}
      </CardContent>
    </Card>
  );
}
