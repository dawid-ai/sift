import { useEffect, useState, type FormEvent } from "react";
import type {
  LibraryFacets,
  MediaFilter,
  MediaListItem,
  PlaylistExportResult,
  SearchHit,
} from "@sift/ipc-contract";
import { TagChip } from "@/components/tag-chip";
import { Button } from "@/components/ui/button";
import {
  getLibraryView,
  setLibraryView,
  getPageSize,
  setPageSize,
  PAGE_SIZE_OPTIONS,
  type LibraryView,
} from "@/lib/library-view";
import { pageWindow } from "@/lib/page-window";
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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(getPageSize());
  const [jump, setJump] = useState(""); // jump-to-page input value
  const [facets, setFacets] = useState<LibraryFacets>({ channels: [], platforms: [], tags: [] });
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
  const [reloadKey, setReloadKey] = useState(0); // bump to force a refetch after a mutation
  const [exportResult, setExportResult] = useState<PlaylistExportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // The active filter, sent to the DB. Search contributes its matched ids (null = no search).
  const filter: MediaFilter = {
    tag: activeTag,
    channel,
    platform,
    from: from ? Date.parse(`${from}T00:00:00`) : null,
    to: to ? Date.parse(`${to}T23:59:59.999`) : null,
    ids: searchHits ? [...searchHits.keys()] : null,
  };

  const anyFilter = !!(activeTag || channel || platform || from || to || searchHits);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function refresh() {
    setReloadKey((k) => k + 1);
  }

  function changePageSize(n: number) {
    setPageSizeState(n);
    setPageSize(n);
    setPage(0); // keep the first row of the current view in sight
  }

  function changeView(v: LibraryView) {
    setView(v);
    setLibraryView(v);
  }

  // Facets span the whole library, so they only change when rows are added/removed —
  // refetch on mount and after any mutation (reloadKey), not on every filter change.
  useEffect(() => {
    void window.sift.library.facets().then(setFacets).catch((e) => setError(String(e)));
  }, [reloadKey]);

  // Consumed the cross-route focus (selectedId was seeded from it) — clear it in the parent so
  // returning to Library later doesn't re-open the same detail.
  useEffect(() => {
    if (focusMediaId != null) onFocusMediaHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Any filter/search change returns to the first page.
  useEffect(() => {
    setPage(0);
  }, [activeTag, channel, platform, from, to, searchHits]);

  // A filtered value can vanish (its last video removed/retagged) while the filter still
  // references it — clear it so the view isn't stranded on an empty result with no visible reset.
  useEffect(() => {
    if (activeTag && !facets.tags.some((t) => t.name.toLowerCase() === activeTag.toLowerCase())) {
      setActiveTag(null);
    }
  }, [facets.tags, activeTag]);
  useEffect(() => {
    if (channel && !facets.channels.includes(channel)) setChannel(null);
  }, [facets.channels, channel]);
  useEffect(() => {
    if (platform && !facets.platforms.includes(platform)) setPlatform(null);
  }, [facets.platforms, platform]);

  // Removing the last row on a page can push `page` past the end — clamp back into range.
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [pageCount, page]);

  // Fetch the current page whenever the filter, page, or a mutation changes it.
  useEffect(() => {
    void window.sift.library
      .listPage(filter, page, pageSize)
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e) => setError(String(e)));
    // filter is rebuilt each render; depend on its primitive parts instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTag, channel, platform, from, to, searchHits, page, pageSize, reloadKey]);

  if (selectedId != null) {
    return (
      <MediaDetailPage
        key={selectedId}
        id={selectedId}
        onBack={() => {
          // Refresh so edits made in the detail view (tags, transcripts,
          // summaries, downloads) reflect in the list, not just on remove.
          setSelectedId(null);
          refresh();
        }}
        onRemoved={() => {
          setSelectedId(null);
          refresh();
        }}
        onOpenChannel={onOpenChannel}
      />
    );
  }

  // Nothing in the library at all (no filter active) — the first-run empty state.
  if (total === 0 && !anyFilter) {
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

  function handleJump(e: FormEvent) {
    e.preventDefault();
    const n = Number(jump);
    if (Number.isInteger(n) && n >= 1 && n <= pageCount) setPage(n - 1);
    setJump("");
  }

  function handleRemove(id: number) {
    void window.sift.library
      .remove(id)
      .then(() => refresh())
      .catch((e) => setError(String(e)));
  }

  async function handleExportM3U() {
    setExportError(null);
    try {
      // Export the whole filtered set, not just the visible page.
      const ids = await window.sift.library.listIds(filter);
      const name = activeTag ?? channel ?? "sift-library";
      setExportResult(await window.sift.library.exportPlaylist(ids, name));
    } catch (e) {
      setExportError(String(e));
    }
  }

  return (
    <main className="flex flex-1 flex-col p-8 min-h-0">
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
          disabled={total === 0}
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
            Open
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
          {facets.channels.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {facets.platforms.length > 1 && (
          <select
            data-testid="library-platform-filter"
            value={platform ?? ""}
            onChange={(e) => setPlatform(e.target.value || null)}
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
          >
            <option value="">All platforms</option>
            {facets.platforms.map((p) => (
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
      {facets.tags.length > 0 && (
        <div
          data-testid="tag-filter-bar"
          className="flex flex-wrap items-center gap-1.5 pb-2"
        >
          {facets.tags.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => setActiveTag(activeTag === t.name ? null : t.name)}
              className={activeTag === t.name ? "ring-1 ring-ring rounded" : ""}
            >
              <TagChip name={t.name} />
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
      <div data-testid="library-scroll" className="flex-1 min-h-0 overflow-auto">
        {total === 0 ? (
          <p data-testid="library-no-matches" className="py-8 text-center text-sm text-foreground/60">
            No matches
          </p>
        ) : view === "table" ? (
          <LibraryTable
            items={items}
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
            {items.map((item) => (
              <MediaCard
                key={item.media.id}
                item={item}
                onOpen={handleOpen}
                onRemove={handleRemove}
                onTagClick={setActiveTag}
                hit={searchHits?.get(item.media.id)}
                query={search.trim()}
              />
            ))}
          </div>
        )}
      </div>
      {total > 0 && (
        <div className="mt-4 flex flex-col items-center gap-2 text-sm">
          <div className="flex items-center gap-2 text-foreground/60">
            <p data-testid="library-result-count">
              Showing {page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total}
            </p>
            <label className="flex items-center gap-1">
              <span className="sr-only">Per page</span>
              <select
                data-testid="library-page-size"
                value={pageSize}
                onChange={(e) => changePageSize(Number(e.target.value))}
                className="rounded border border-border bg-transparent px-1 py-0.5 text-xs"
                aria-label="Results per page"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}/page
                  </option>
                ))}
              </select>
            </label>
          </div>
          {pageCount > 1 && (
            <div data-testid="library-pager" className="flex flex-wrap items-center justify-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                data-testid="library-page-first"
                disabled={page === 0}
                onClick={() => setPage(0)}
              >
                First
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="library-page-prev"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Prev
              </Button>
              {pageWindow(page + 1, pageCount).map((tok, i) =>
                tok === "…" ? (
                  <span key={`gap-${i}`} className="px-1 text-foreground/40" aria-hidden>
                    …
                  </span>
                ) : (
                  <Button
                    key={tok}
                    size="sm"
                    variant={tok - 1 === page ? "default" : "outline"}
                    data-testid={`library-page-${tok}`}
                    aria-current={tok - 1 === page ? "page" : undefined}
                    aria-label={`Page ${tok}`}
                    onClick={() => setPage(tok - 1)}
                  >
                    {tok}
                  </Button>
                ),
              )}
              <Button
                size="sm"
                variant="outline"
                data-testid="library-page-next"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                Next
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="library-page-last"
                disabled={page >= pageCount - 1}
                onClick={() => setPage(pageCount - 1)}
              >
                Last
              </Button>
              {pageCount > 5 && (
                <form onSubmit={handleJump} className="ml-2 flex items-center gap-1">
                  <label htmlFor="library-jump" className="text-foreground/60">
                    Go to
                  </label>
                  <input
                    id="library-jump"
                    data-testid="library-page-jump"
                    type="number"
                    min={1}
                    max={pageCount}
                    value={jump}
                    onChange={(e) => setJump(e.target.value)}
                    placeholder={String(page + 1)}
                    className="w-16 rounded border border-border bg-transparent px-1 py-0.5 text-sm"
                    aria-label={`Jump to page (1–${pageCount})`}
                  />
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
