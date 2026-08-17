import { Download, FolderOpen, RotateCcw } from "lucide-react";
import { LOCAL_FORMAT_ID } from "@sift/core";
import type {
  DownloadProgress,
  DownloadRecord,
  MediaDetail,
} from "@sift/ipc-contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// Downloads is one section of the Files tab, so it renders the Files tab's row — imported, not
// re-typed. The two lists had drifted into different paddings, different leading chips and
// different orderings of the same two parts while claiming to be one list.
import {
  Caption,
  EMPTY_CHIP,
  EMPTY_ROW,
  ROW_BOX,
  ROW_CHIP_BOX,
  ROW_SURFACE,
} from "./files-panel";

/** `done` is deliberately absent — see `statusLabel`. */
const STATUS_LABEL: Record<
  Exclude<DownloadRecord["status"], "done">,
  string
> = {
  downloading: "Downloading…",
  error: "Failed",
};

/** The status worth saying out loud, or `null` for the one that isn't.
 *
 * A finished download gets no pill: every row in a section headed DOWNLOADS is downloaded, so
 * "Downloaded" was a tautology — and it was a tautology occupying 90px of a 400px column that
 * the filename needed. An *imported* local file is the one `done` that is not the default: it
 * was never fetched, and removing it won't delete it, so it keeps its word. */
function statusLabel(d: DownloadRecord): string | null {
  if (d.status === "done")
    return d.formatId === LOCAL_FORMAT_ID ? "Imported" : null;
  return STATUS_LABEL[d.status];
}

/** Status hue: a finished file is success, an in-flight one is a media action (amber),
 * a failure is danger. The pill always carries the word too — never colour alone. */
const STATUS_VARIANT: Record<
  DownloadRecord["status"],
  "success" | "default" | "danger"
> = {
  done: "success",
  downloading: "default",
  error: "danger",
};

const GHOST_BUTTON =
  "border border-white/10 bg-transparent text-muted-foreground hover:border-white/20 hover:bg-white/[0.04] hover:text-foreground";

/** Destructive secondary: identical shell to "Open" beside it — a bare word next to a bordered
 * button reads as an unstyled leftover with an invisible hit target — and the danger hue is
 * spent on hover only. Same pattern as the header's Remove control. */
const DANGER_GHOST_BUTTON = `${GHOST_BUTTON} hover:border-danger/30 hover:bg-danger/10 hover:text-danger`;

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
  const pct =
    progress && progress.total
      ? Math.min(100, Math.round((progress.received / progress.total) * 100))
      : null;

  return (
    <section className="flex flex-col gap-1.5">
      {downloads.map((d) => {
        const fileName = d.filePath?.split(/[\\/]/).pop() ?? null;
        const status = statusLabel(d);
        return (
          <div
            key={d.id}
            data-testid="media-detail-download"
            className={`${ROW_BOX} text-sm ${
              d.status === "error"
                ? "border-danger/30 bg-danger/[0.07]"
                : ROW_SURFACE
            }`}
          >
            <span
              aria-hidden
              className={`${ROW_CHIP_BOX} ${
                d.status === "error"
                  ? "bg-danger/12 text-danger"
                  : "bg-white/[0.05] text-foreground/50"
              }`}
            >
              <Download />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {/* **Line one is the name and the actions. Nothing else.** Same as every other
                  Files row the artifact's NAME leads — but the markers that used to trail it on
                  this line (`720P`, a status pill) are `flex-none`, as are the two buttons, so in
                  a 400px column they took every pixel, the only shrinkable child was the filename,
                  and `Fixture Channel__Fixture Video Title.mp4` rendered as the single glyph "F".
                  A file list's name column is the one thing that must never be the part that
                  yields, so it takes the free space (`flex-1`) instead of the leftovers; the
                  markers ride the caption line below, still trailing the name, one rung down.
                  Before the file exists there is no name yet, so the format stands in for it.

                  `min-w-[3rem]` is a floor against a glyph, deliberately set *below* the narrowest
                  column this layout can produce (~62px of name at the 1024px lg breakpoint, ~160px
                  at 1280px). A floor set at a comfortable reading width would be violated at the
                  narrow end, and because everything beside it is `flex-none` the row would resolve
                  that by overflowing — clipping the Remove button against the panel's hidden
                  overflow. A truncated name is a bad name; an amputated button is a broken row. */}
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="min-w-[3rem] flex-1 truncate text-sm font-medium text-foreground"
                  title={d.filePath ?? undefined}
                >
                  {fileName ?? d.label}
                </span>
                <div className="ml-auto flex flex-none items-center gap-1.5">
                  {d.filePath && d.status === "done" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className={GHOST_BUTTON}
                      data-testid="media-detail-download-reveal"
                      onClick={() =>
                        void window.sift.library.reveal(d.filePath!)
                      }
                    >
                      <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                      Open
                    </Button>
                  )}
                  {d.status === "error" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className={GHOST_BUTTON}
                      data-testid="media-detail-download-retry"
                      disabled={downloadingFormat !== null}
                      onClick={() => onRetry(d)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                      Retry
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid="media-detail-download-remove"
                    className={DANGER_GHOST_BUTTON}
                    onClick={() => onRemove(d.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              {/* Markers, then the shared caption stamp — same format, same tabular column as the
                  Transcripts and Summaries rows directly above. This line carries no `flex-none`
                  button cluster, so the pills can sit here without costing anything that has to
                  be read. The format pill is dropped when there is no file yet, because the label
                  is then standing in as the row's title one line up and would read twice. */}
              <div className="flex min-w-0 items-center gap-2">
                {fileName && (
                  <Badge variant="code" className="flex-none">
                    {d.label}
                  </Badge>
                )}
                {status && (
                  <Badge
                    variant={STATUS_VARIANT[d.status]}
                    className="flex-none"
                  >
                    {status}
                  </Badge>
                )}
                <Caption at={d.createdAt} />
              </div>
              {d.formatId === LOCAL_FORMAT_ID && (
                <p className="text-xs text-muted-foreground">
                  Removes the library entry — your file stays where it is.
                </p>
              )}
              {d.status === "error" && d.error && (
                <p className="truncate text-xs text-danger" title={d.error}>
                  {d.error}
                </p>
              )}
            </div>
          </div>
        );
      })}

      {downloads.length === 0 && (
        <div className={EMPTY_ROW}>
          <span aria-hidden className={EMPTY_CHIP}>
            <Download />
          </span>
          <p className="min-w-0 truncate text-[12.5px] text-muted-foreground">
            No files yet. Download from Home or the Queue.
          </p>
        </div>
      )}

      {downloadingFormat && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary/70">
              Downloading
            </span>
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
              {pct === null ? "Starting…" : `${pct}%`}
            </span>
          </div>
          <div className="h-[3px] overflow-hidden rounded-full bg-white/10">
            <div
              data-testid="media-detail-download-progress"
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: pct === null ? "33%" : `${pct}%` }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
