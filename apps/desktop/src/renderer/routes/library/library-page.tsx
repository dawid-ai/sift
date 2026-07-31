import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { MediaListItem, PlaylistExportResult, SearchHit } from "@sift/ipc-contract";
import { TagChip } from "@/components/tag-chip";
import { Button } from "@/components/ui/button";
import { getLibraryView, setLibraryView, type LibraryView } from "@/lib/library-view";
import { unionTags } from "@/lib/library-tags";
import { filterLibrary } from "@/lib/library-filter";
import { platformLabel } from "@/lib/platform-label";
import { LibraryTable } from "@/routes/library/library-table";
import { MediaCard } from "@/routes/library/media-card";
import { MediaDetailPage } from "@/routes/library/media-detail";

export interface LibraryPageProps {
  onOpenChannel?: (mediaId: number) => void;
  /** When set (e.g. from a channel's downloaded list), open this media's detail on mount. */
  focusMediaId?: number | null;
  onFocusMediaHandled?: () => void;
}

export function LibraryPage({ onOpenChannel, focusMediaId, onFocusMediaHandled }: LibraryPageProps) {
  const [items, setItems] = useState<MediaListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(focusMediaId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<LibraryView>(getLibraryView());
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchHits, setSearchHits] = useState<Map<number, SearchHit> | null>(null);
  const [channel, setChannel] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [from, setFrom] = useState<string>(""); // yyyy-mm-dd
  const [to, setTo] = useState<string>("");
  const [exportResult, setExportResult] = useState<PlaylistExportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  function refresh() {
    return window.sift.library.list().then(setItems);
  }

  function changeView(v: LibraryView) {
    setView(v);
    setLibraryView(v);
  }

  useEffect(() => {
    void refresh();
  }, []);

  // Consumed the cross-route focus (selectedId was seeded from it) — clear it in the parent so
  // returning to Library later doesn't re-open the same detail.
  useEffect(() => {
    if (focusMediaId != null) onFocusMediaHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Computed before any early return so this stays a stable hook order
  // regardless of `selectedId`/`items.length` (rules of hooks).
  const allTags = unionTags(items);
  const channels = Array.from(
    new Set(items.map((i) => i.media.uploader).filter((u): u is string => !!u)),
  ).sort((a, b) => a.localeCompare(b));
  // Platform filter options adapt to what's actually in the library (not all yt-dlp extractors).
  const platforms = Array.from(
    new Set(items.map((i) => i.media.platformId).filter((p): p is string => !!p)),
  ).sort((a, b) => platformLabel(a).localeCompare(platformLabel(b)));

  // Debounced DB search: empty query clears hits without an IPC round-trip.
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setSearchHits(null);
      return;
    }
    const t = setTimeout(() => {
      void window.sift.library.search(q).then((hits) => {
        setSearchHits(new Map(hits.map((h) => [h.mediaId, h])));
      });
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    // A tag can vanish from the union (e.g. its last remaining video had
    // the tag removed) while `activeTag` still references it. Left alone,
    // that strands the view on an empty filtered list with no visible way
    // to clear it, since the filter bar only renders when allTags.length > 0.
    if (activeTag && !allTags.some((t) => t.toLowerCase() === activeTag.toLowerCase())) {
      setActiveTag(null);
    }
  }, [allTags, activeTag]);

  // Same stranding guard for the platform filter: clear it if its platform is no
  // longer present (e.g. the last video of that platform was removed).
  useEffect(() => {
    if (platform && !platforms.includes(platform)) setPlatform(null);
  }, [platforms, platform]);

  if (selectedId != null) {
    return (
      <MediaDetailPage
        key={selectedId}
        id={selectedId}
        onBack={() => {
          // Refresh so edits made in the detail view (tags, transcripts,
          // summaries, downloads) reflect in the list, not just on remove.
          setSelectedId(null);
          void refresh();
        }}
        onRemoved={() => {
          setSelectedId(null);
          void refresh();
        }}
        onOpenChannel={onOpenChannel}
      />
    );
  }

  if (items.length === 0) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p data-testid="library-empty" className="text-sm text-foreground/60">
          No downloads yet
        </p>
      </main>
    );
  }

  function handleOpen(id: number) {
    setSelectedId(id);
  }

  function handleRemove(id: number) {
    void window.sift.library
      .remove(id)
      .then(refresh)
      .catch((e) => setError(String(e)));
  }

  const shown = filterLibrary(items, {
    activeTag,
    channel,
    platform,
    from: from ? Date.parse(`${from}T00:00:00`) : null,
    to: to ? Date.parse(`${to}T23:59:59.999`) : null,
    searchIds: searchHits ? new Set(searchHits.keys()) : null,
  });

  async function handleExportM3U() {
    setExportError(null);
    try {
      const ids = shown.map((i) => i.media.id);
      const name = activeTag ?? channel ?? "sift-library";
      setExportResult(await window.sift.library.exportPlaylist(ids, name));
    } catch (e) {
      setExportError(String(e));
    }
  }

  return (
    <main className="flex flex-1 flex-col p-8">
      {error && (
        <p data-testid="library-remove-error" className="mb-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="mb-4 flex gap-2">
        <Button
          size="sm"
          variant={view === "table" ? "default" : "outline"}
          data-testid="library-view-table"
          onClick={() => changeView("table")}
        >
          Table
        </Button>
        <Button
          size="sm"
          variant={view === "tiles" ? "default" : "outline"}
          data-testid="library-view-tiles"
          onClick={() => changeView("tiles")}
        >
          Tiles
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="export-m3u"
          disabled={shown.length === 0}
          onClick={handleExportM3U}
        >
          Export M3U
        </Button>
      </div>
      {exportError && (
        <p data-testid="playlist-export-error" className="mb-2 text-sm text-red-600 dark:text-red-400">
          {exportError}
        </p>
      )}
      {exportResult && (
        <p data-testid="playlist-export-result" className="mb-2 flex items-center gap-2 text-sm text-foreground/70">
          Exported {exportResult.included} video{exportResult.included === 1 ? "" : "s"}
          {exportResult.skipped > 0 ? ` (${exportResult.skipped} skipped)` : ""}
          <button
            type="button"
            className="underline"
            onClick={() => void window.sift.library.reveal(exportResult.path)}
          >
            Show in folder
          </button>
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          data-testid="library-search-input"
          type="search"
          placeholder="Search title, transcript, summary…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[16rem] flex-1 rounded border border-border bg-transparent px-2 py-1 text-sm"
        />
        <select
          data-testid="library-channel-filter"
          value={channel ?? ""}
          onChange={(e) => setChannel(e.target.value || null)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="">All channels</option>
          {channels.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {platforms.length > 1 && (
          <select
            data-testid="library-platform-filter"
            value={platform ?? ""}
            onChange={(e) => setPlatform(e.target.value || null)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          >
            <option value="">All platforms</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {platformLabel(p)}
              </option>
            ))}
          </select>
        )}
        <input
          data-testid="library-date-from"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          aria-label="From date"
        />
        <input
          data-testid="library-date-to"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          aria-label="To date"
        />
      </div>
      {allTags.length > 0 && (
        <div
          data-testid="tag-filter-bar"
          className="flex flex-wrap items-center gap-1.5 pb-2"
        >
          {allTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTag(activeTag === t ? null : t)}
              className={activeTag === t ? "ring-1 ring-ring rounded" : ""}
            >
              <TagChip name={t} />
            </button>
          ))}
          {activeTag && (
            <button
              type="button"
              data-testid="tag-filter-clear"
              className="text-xs text-muted-foreground underline"
              onClick={() => setActiveTag(null)}
            >
              Clear
            </button>
          )}
        </div>
      )}
      {view === "table" ? (
        <LibraryTable
          items={shown}
          onOpen={handleOpen}
          onRemove={handleRemove}
          onTagClick={setActiveTag}
          hits={searchHits}
          query={search.trim()}
        />
      ) : (
        <div
          data-testid="library-grid"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {shown.map((item, index) => (
            <motion.div
              key={item.media.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03, ease: "easeOut" }}
            >
              <MediaCard
                item={item}
                onOpen={handleOpen}
                onRemove={handleRemove}
                onTagClick={setActiveTag}
                hit={searchHits?.get(item.media.id)}
                query={search.trim()}
              />
            </motion.div>
          ))}
        </div>
      )}
    </main>
  );
}
