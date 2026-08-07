import type { DownloadProgress, DownloadRecord, MediaDetail } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";

const STATUS_LABEL: Record<DownloadRecord["status"], string> = {
  done: "Downloaded",
  downloading: "Downloading…",
  error: "Failed",
};

export interface DownloadsPanelProps {
  downloads: MediaDetail["downloads"];
  downloadingFormat: string | null;
  progress: DownloadProgress | null;
  onRetry: (d: DownloadRecord) => void;
  onRemove: (id: number) => void;
}

/** Lists a media item's downloads with per-item retry/reveal/remove and in-flight progress. */
export function DownloadsPanel({
  downloads,
  downloadingFormat,
  progress,
  onRetry,
  onRemove,
}: DownloadsPanelProps) {
  return (
    <section className="flex flex-col gap-2">
      {downloads.map((d) => (
        <div
          key={d.id}
          data-testid="media-detail-download"
          className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
            d.status === "error"
              ? "border-red-500/40 bg-red-500/5"
              : "border-border"
          }`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium">
              {d.label}
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-normal ${
                  d.status === "error"
                    ? "border-red-500/50 text-red-600 dark:text-red-400"
                    : "border-border text-foreground/60"
                }`}
              >
                {STATUS_LABEL[d.status]}
              </span>
            </div>
            {d.status === "error" && d.error && (
              <p className="mt-0.5 truncate text-xs text-red-600 dark:text-red-400" title={d.error}>
                {d.error}
              </p>
            )}
          </div>
          <div className="ml-auto flex flex-none gap-2">
            {d.filePath && d.status === "done" && (
              <Button
                size="sm"
                variant="outline"
                data-testid="media-detail-download-reveal"
                onClick={() => void window.sift.library.reveal(d.filePath!)}
              >
                Open
              </Button>
            )}
            {d.status === "error" && (
              <Button
                size="sm"
                variant="outline"
                data-testid="media-detail-download-retry"
                disabled={downloadingFormat !== null}
                onClick={() => onRetry(d)}
              >
                Retry
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              data-testid="media-detail-download-remove"
              onClick={() => onRemove(d.id)}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      {downloads.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-foreground/50">
          No files yet. Download this video from Home or the Queue.
        </p>
      )}

      {downloadingFormat && (
        <div className="flex flex-col gap-1.5">
          <div className="h-2.5 overflow-hidden rounded-full bg-border">
            <div
              data-testid="media-detail-download-progress"
              className="h-full rounded-full bg-primary transition-[width]"
              style={{
                width:
                  progress && progress.total
                    ? `${Math.min(100, Math.round((progress.received / progress.total) * 100))}%`
                    : "33%",
              }}
            />
          </div>
          <p className="text-xs text-foreground/60">
            {progress && progress.total
              ? `${Math.min(100, Math.round((progress.received / progress.total) * 100))}%`
              : "Starting…"}
          </p>
        </div>
      )}
    </section>
  );
}
