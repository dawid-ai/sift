import { useState } from "react";
import type { MediaListItem, SearchHit } from "@sift/ipc-contract";
import { TagChip } from "@/components/tag-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, videoThumbUrl } from "@/lib/utils";
import { highlightSegments } from "@/lib/search-snippet";
import { platformLabel } from "@/lib/platform-label";
import { formatDuration } from "@/routes/home/preview-card";

export interface LibraryTableProps {
  items: MediaListItem[];
  onOpen: (id: number) => void;
  onRemove: (id: number) => void;
  onTagClick: (name: string) => void;
  hits?: Map<number, SearchHit> | null;
  query?: string;
}

/** Table-first library view: one row per media item, with format/transcript/summary counts
 * at a glance instead of requiring a detail-page visit. */
export function LibraryTable({ items, onOpen, onRemove, onTagClick, hits, query }: LibraryTableProps) {
  return (
    <table data-testid="library-table" className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-foreground/60">
          <th className="px-2 py-2 font-medium">Video</th>
          <th className="px-2 py-2 font-medium">Platform</th>
          <th className="px-2 py-2 font-medium">Transcript</th>
          <th className="px-2 py-2 font-medium">Formats</th>
          <th className="px-2 py-2 font-medium">Summaries</th>
          <th className="px-2 py-2 font-medium">Added</th>
          <th className="px-2 py-2 font-medium">⋯</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <LibraryRow
            key={item.media.id}
            item={item}
            onOpen={onOpen}
            onRemove={onRemove}
            onTagClick={onTagClick}
            hit={hits?.get(item.media.id)}
            query={query}
          />
        ))}
      </tbody>
    </table>
  );
}

interface LibraryRowProps {
  item: MediaListItem;
  onOpen: (id: number) => void;
  onRemove: (id: number) => void;
  onTagClick: (name: string) => void;
  hit?: SearchHit | undefined;
  query?: string | undefined;
}

/** A single row, with its own inline-confirm state for Remove (mirrors MediaCard). */
function LibraryRow({ item, onOpen, onRemove, onTagClick, hit, query }: LibraryRowProps) {
  const [confirming, setConfirming] = useState(false);
  const { media, transcriptCount, transcriptLanguage, formats, summaryCount, tags } = item;

  return (
    <tr data-testid="library-row" className="border-b border-border hover:bg-primary/5">
      <td className="px-2 py-2">
        <div className="flex items-center gap-2">
          {media.thumbnailUrl && (
            <img
              src={videoThumbUrl(media.thumbnailUrl)}
              alt={media.title}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
              className="h-10 w-16 shrink-0 rounded object-cover"
            />
          )}
          <div className="min-w-0">
            <p className="line-clamp-1 font-medium">{media.title}</p>
            <p className="text-xs text-foreground/60">
              {[media.uploader, formatDuration(media.durationSec)].filter(Boolean).join(" · ")}
            </p>
            {hit && (hit.field === "transcript" || hit.field === "summary") && hit.snippet && (
              <div data-testid="search-snippet" className="mt-0.5 text-xs text-foreground/60">
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
            {tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {tags.map((t) => (
                  <button key={t} type="button" onClick={() => onTagClick(t)}>
                    <TagChip name={t} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-2 py-2">
        <Badge data-testid="library-row-platform" variant="outline">{platformLabel(media.platformId)}</Badge>
      </td>
      <td className="px-2 py-2">
        {transcriptCount > 0 && transcriptLanguage ? (
          <Badge variant="outline">{transcriptLanguage.toUpperCase()}</Badge>
        ) : (
          "—"
        )}
      </td>
      <td className="px-2 py-2">
        {formats.length > 0 ? (
          <div className="flex flex-wrap gap-1">
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
          </div>
        ) : (
          "—"
        )}
      </td>
      <td className="px-2 py-2">{summaryCount || "—"}</td>
      <td className="px-2 py-2 text-foreground/60">
        {new Date(media.createdAt).toLocaleDateString()}
      </td>
      <td className="px-2 py-2">
        <div className="flex gap-2">
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
      </td>
    </tr>
  );
}
