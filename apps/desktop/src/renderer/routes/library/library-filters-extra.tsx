import { useEffect, useState } from "react";
import { Bookmark, Star, Trash2 } from "lucide-react";
import type {
  CollectionCount,
  MediaFilter,
  SavedSearchInfo,
} from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Duration buckets, in seconds. Fixed rather than two number boxes: the useful question is
 * "is this a short or a talk", and a pair of free-text second fields makes the user do
 * arithmetic to ask it. */
export const DURATION_BUCKETS: {
  value: string;
  label: string;
  min: number | null;
  max: number | null;
}[] = [
  { value: "lt5", label: "Under 5 min", min: null, max: 300 },
  { value: "5to20", label: "5–20 min", min: 300, max: 1200 },
  { value: "20to60", label: "20–60 min", min: 1200, max: 3600 },
  { value: "gt60", label: "Over 1 hour", min: 3600, max: null },
];

export const MISSING_OPTIONS = [
  { value: "transcript", label: "No transcript" },
  { value: "summary", label: "No summary" },
  { value: "download", label: "No media file" },
];

export interface ExtraFilterState {
  durationBucket: string | null;
  missing: string | null;
  failedOnly: boolean;
  favouriteOnly: boolean;
  collectionId: number | null;
  publishedFrom: string; // yyyy-mm-dd
  publishedTo: string;
}

export const EMPTY_EXTRA: ExtraFilterState = {
  durationBucket: null,
  missing: null,
  failedOnly: false,
  favouriteOnly: false,
  collectionId: null,
  publishedFrom: "",
  publishedTo: "",
};

/** Folds the extra controls into the `MediaFilter` the main page sends to the database. */
export function extraToFilter(e: ExtraFilterState): Partial<MediaFilter> {
  const bucket = DURATION_BUCKETS.find((b) => b.value === e.durationBucket);
  return {
    durationMin: bucket?.min ?? null,
    durationMax: bucket?.max ?? null,
    missing: (e.missing as MediaFilter["missing"]) ?? null,
    downloadStatus: e.failedOnly ? "error" : null,
    favourite: e.favouriteOnly ? true : null,
    collectionId: e.collectionId,
    publishedFrom: e.publishedFrom
      ? Date.parse(`${e.publishedFrom}T00:00:00`)
      : null,
    publishedTo: e.publishedTo
      ? Date.parse(`${e.publishedTo}T23:59:59.999`)
      : null,
  };
}

export function isExtraActive(e: ExtraFilterState): boolean {
  return !!(
    e.durationBucket ||
    e.missing ||
    e.failedOnly ||
    e.favouriteOnly ||
    e.collectionId !== null ||
    e.publishedFrom ||
    e.publishedTo
  );
}

const TOGGLE_BASE =
  "flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors";

/**
 * The second filter row: duration, publish window, smart filters, favourites, collections,
 * and saved searches.
 *
 * Kept out of `library-page.tsx` because that file is already the page's layout and its
 * first filter row; a second row of seven controls belongs next to its own state, not
 * inlined into a 1400-line component.
 */
export function LibraryFiltersExtra({
  extra,
  onChange,
  collections,
  savedSearches,
  onApplySaved,
  onSaveCurrent,
  onDeleteSaved,
  onFindDuplicates,
}: {
  extra: ExtraFilterState;
  onChange: (next: ExtraFilterState) => void;
  collections: CollectionCount[];
  savedSearches: SavedSearchInfo[];
  onApplySaved: (search: SavedSearchInfo) => void;
  onSaveCurrent: (name: string) => Promise<void>;
  onDeleteSaved: (id: number) => Promise<void>;
  onFindDuplicates: () => void;
}) {
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ExtraFilterState>(
    key: K,
    value: ExtraFilterState[K],
  ) => onChange({ ...extra, [key]: value });

  async function save() {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      await onSaveCurrent(saveName.trim());
      setSaveName("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      data-testid="library-filters-extra"
      className="flex flex-wrap items-center gap-2"
    >
      <FilterSelect
        value={extra.durationBucket}
        onChange={(v) => set("durationBucket", v)}
        options={DURATION_BUCKETS.map((b) => ({
          value: b.value,
          label: b.label,
        }))}
        allLabel="Any length"
        testId="filter-duration"
      />
      <FilterSelect
        value={extra.missing}
        onChange={(v) => set("missing", v)}
        options={MISSING_OPTIONS}
        allLabel="Anything"
        testId="filter-missing"
      />
      <FilterSelect
        value={extra.collectionId === null ? null : String(extra.collectionId)}
        onChange={(v) => set("collectionId", v === null ? null : Number(v))}
        options={collections.map((c) => ({
          value: String(c.id),
          label: `${c.name} (${c.count})`,
        }))}
        allLabel="All collections"
        testId="filter-collection"
      />

      <button
        type="button"
        data-testid="filter-favourites"
        aria-pressed={extra.favouriteOnly}
        onClick={() => set("favouriteOnly", !extra.favouriteOnly)}
        className={cn(
          TOGGLE_BASE,
          extra.favouriteOnly
            ? "border-primary/40 bg-primary/15 text-foreground"
            : "border-white/[0.07] bg-black/25 text-foreground/70 hover:text-foreground",
        )}
      >
        <Star
          aria-hidden
          className={cn("h-3.5 w-3.5", extra.favouriteOnly && "fill-current")}
        />
        Favourites
      </button>
      <button
        type="button"
        data-testid="filter-failed"
        aria-pressed={extra.failedOnly}
        onClick={() => set("failedOnly", !extra.failedOnly)}
        className={cn(
          TOGGLE_BASE,
          extra.failedOnly
            ? "border-danger/40 bg-danger/15 text-foreground"
            : "border-white/[0.07] bg-black/25 text-foreground/70 hover:text-foreground",
        )}
      >
        Failed downloads
      </button>

      {/* Published, not added — the first filter row already owns "Added". */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-foreground/45">
          Published
        </span>
        <Input
          type="date"
          aria-label="Published from"
          data-testid="filter-published-from"
          className="h-9 w-[9.5rem] text-[12px]"
          value={extra.publishedFrom}
          onChange={(e) => set("publishedFrom", e.target.value)}
        />
        <Input
          type="date"
          aria-label="Published to"
          data-testid="filter-published-to"
          className="h-9 w-[9.5rem] text-[12px]"
          value={extra.publishedTo}
          onChange={(e) => set("publishedTo", e.target.value)}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          className="h-9 px-2.5 text-[12px]"
          data-testid="find-duplicates"
          onClick={onFindDuplicates}
        >
          Find duplicates
        </Button>
      </div>

      {/* Saved searches get their own line so the row above stays one row. */}
      <div className="flex w-full flex-wrap items-center gap-2 border-t border-white/[0.05] pt-2">
        <Bookmark aria-hidden className="h-3.5 w-3.5 text-foreground/45" />
        {savedSearches.length === 0 && (
          <span className="text-[12px] text-foreground/45">
            No saved searches yet.
          </span>
        )}
        {savedSearches.map((s) => (
          <span
            key={s.id}
            className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-black/25 pl-2.5 text-[12px]"
          >
            <button
              type="button"
              data-testid={`saved-search-${s.id}`}
              className="py-1.5 text-foreground/80 hover:text-foreground"
              onClick={() => onApplySaved(s)}
            >
              {s.name}
            </button>
            <button
              type="button"
              aria-label={`Delete saved search ${s.name}`}
              data-testid={`saved-search-delete-${s.id}`}
              className="px-1.5 py-1.5 text-foreground/40 hover:text-danger"
              onClick={() => void onDeleteSaved(s.id)}
            >
              <Trash2 aria-hidden className="h-3 w-3" />
            </button>
          </span>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <Input
            data-testid="saved-search-name"
            aria-label="Name for this search"
            className="h-9 w-[12rem] text-[12px]"
            placeholder="Save this view as…"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
          />
          <Button
            variant="ghost"
            className="h-9 px-2.5 text-[12px]"
            data-testid="saved-search-save"
            disabled={!saveName.trim() || saving}
            onClick={() => void save()}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Loads collections and saved searches once, and reloads on demand after a mutation. */
export function useLibraryOrganisation(reloadKey: number) {
  const [collections, setCollections] = useState<CollectionCount[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearchInfo[]>([]);

  useEffect(() => {
    let live = true;
    void Promise.all([
      window.sift.collections.list(),
      window.sift.savedSearches.list(),
    ])
      .then(([c, s]) => {
        if (!live) return;
        setCollections(c);
        setSavedSearches(s);
      })
      .catch(() => {
        /* an empty sidebar is a survivable failure; the page still lists videos */
      });
    return () => {
      live = false;
    };
  }, [reloadKey]);

  return { collections, savedSearches };
}
