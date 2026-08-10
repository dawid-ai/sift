import { useState } from "react";
import type { MediaListItem, MediaRecord, SearchHit } from "@sift/ipc-contract";
import { TagChip } from "@/components/tag-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, videoThumbUrl } from "@/lib/utils";
import { highlightSegments } from "@/lib/search-snippet";
import { platformLabel } from "@/lib/platform-label";

const STATUS_LABELS: Record<MediaRecord["downloadStatus"], string> = {
  none: "Not downloaded",
  downloading: "Downloading",
  done: "Done",
  error: "Error",
};

export interface MediaCardProps {
  item: MediaListItem;
  onOpen: (id: number) => void;
  onRemove: (id: number) => void;
  onTagClick: (name: string) => void;
  /** Right-click a tag: toggles it as a negative filter (hide everything carrying it). */
  onTagExclude?: (name: string) => void;
  hit?: SearchHit | undefined;
  query?: string | undefined;
}

/** Presentational card for a single library entry: open detail + inline-confirm remove. */
export function MediaCard({ item, onOpen, onRemove, onTagClick, onTagExclude, hit, query }: MediaCardProps) {
  const [confirming, setConfirming] = useState(false);
  const { media, transcriptCount, transcriptLanguage, formats, summaryCount, tags } = item;

  return (
    <Card data-testid="media-card">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle data-testid="media-title" className="line-clamp-2">
          {media.title}
        </CardTitle>
        <Badge data-testid="media-status" variant="outline" className="shrink-0">
          {STATUS_LABELS[media.downloadStatus]}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {media.thumbnailUrl && (
          <img
            src={videoThumbUrl(media.thumbnailUrl)}
            alt={media.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
            className="max-w-full rounded"
          />
        )}
        <div className="flex items-center gap-2">
          <Badge data-testid="media-card-platform" variant="outline">{platformLabel(media.platformId)}</Badge>
          {media.uploader && <p className="truncate text-sm text-foreground/70">{media.uploader}</p>}
        </div>
        {hit && (hit.field === "transcript" || hit.field === "summary") && hit.snippet && (
          <div data-testid="search-snippet" className="text-xs text-foreground/60">
            <span className="mr-1 text-[10px] uppercase tracking-wide text-foreground/40">
              {hit.field}
            </span>
            {highlightSegments(hit.snippet, query ?? "").map((s, i) =>
              s.match ? (
                <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/50">
                  {s.text}
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {transcriptCount > 0 && transcriptLanguage && (
            <Badge variant="outline">{transcriptLanguage.toUpperCase()}</Badge>
          )}
          {formats.map((f) => (
            <Badge
              key={f.id}
              variant="outline"
              className={cn(
                f.status === "error" &&
                  "border-red-600 text-red-600 dark:border-red-400 dark:text-red-400",
              )}
            >
              {f.label}
            </Badge>
          ))}
          {summaryCount > 0 && (
            <Badge variant="outline">
              {summaryCount} {summaryCount === 1 ? "summary" : "summaries"}
            </Badge>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onTagClick(t)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onTagExclude?.(t);
                }}
                title={`Click to filter by "${t}", right-click to hide it`}
              >
                <TagChip name={t} />
              </button>
            ))}
          </div>
        )}
        {media.downloadPath && (
          <div className="flex flex-col gap-2">
            <p
              data-testid="media-path"
              className="break-all text-xs text-foreground/50"
              title={media.downloadPath}
            >
              {media.downloadPath}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              data-testid="media-reveal"
              onClick={() => void window.sift.library.reveal(media.downloadPath!)}
            >
              Open
            </Button>
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid="media-open"
            onClick={() => onOpen(media.id)}
          >
            Details
          </Button>
          {confirming ? (
            <>
              <Button
                size="sm"
                data-testid="media-remove-confirm"
                onClick={() => onRemove(media.id)}
              >
                Confirm remove
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              data-testid="media-remove"
              onClick={() => setConfirming(true)}
            >
              Remove
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
