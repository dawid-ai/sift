import type { SiftDatabase } from "./database";
import type { MediaFilter } from "./media";

export interface SavedSearchRow {
  id: number;
  name: string;
  query: string;
  filter: MediaFilter;
  created_at: number;
}

interface SavedSearchDbRow {
  id: number;
  name: string;
  query: string;
  filter_json: string;
  created_at: number;
}

/**
 * Rebuilds a `MediaFilter` from stored JSON, keeping only fields this build knows.
 *
 * A saved search outlives the shape of `MediaFilter`: the column holds whatever was current
 * when it was saved, so a filter written by a newer build must degrade to the parts that
 * still mean something rather than reaching a query builder as junk.
 */
export function parseSavedFilter(raw: string): MediaFilter {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return {};
  const f = parsed as Record<string, unknown>;
  const strArray = (v: unknown): string[] | undefined =>
    Array.isArray(v) && v.every((x) => typeof x === "string")
      ? (v as string[])
      : undefined;
  const numOr = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const strOr = (v: unknown): string | undefined =>
    typeof v === "string" ? v : undefined;

  const out: MediaFilter = {};
  const tags = strArray(f.tags);
  if (tags) out.tags = tags;
  const excludeTags = strArray(f.excludeTags);
  if (excludeTags) out.excludeTags = excludeTags;
  const channel = strOr(f.channel);
  if (channel) out.channel = channel;
  const platform = strOr(f.platform);
  if (platform) out.platform = platform;
  const from = numOr(f.from);
  if (from !== undefined) out.from = from;
  const to = numOr(f.to);
  if (to !== undefined) out.to = to;
  const publishedFrom = numOr(f.publishedFrom);
  if (publishedFrom !== undefined) out.publishedFrom = publishedFrom;
  const publishedTo = numOr(f.publishedTo);
  if (publishedTo !== undefined) out.publishedTo = publishedTo;
  const durationMin = numOr(f.durationMin);
  if (durationMin !== undefined) out.durationMin = durationMin;
  const durationMax = numOr(f.durationMax);
  if (durationMax !== undefined) out.durationMax = durationMax;
  if (f.favourite === true) out.favourite = true;
  const collectionId = numOr(f.collectionId);
  if (collectionId !== undefined) out.collectionId = collectionId;
  const missing = strOr(f.missing);
  if (
    missing === "transcript" ||
    missing === "summary" ||
    missing === "download"
  )
    out.missing = missing;
  const downloadStatus = strOr(f.downloadStatus);
  if (downloadStatus) out.downloadStatus = downloadStatus;
  // `ids` is deliberately dropped: it holds the ids of one search run, which say nothing a
  // week later. The free-text `query` is re-run instead.
  return out;
}

/** Creates or replaces a saved search by name. */
export function saveSearch(
  db: SiftDatabase,
  input: { name: string; query: string; filter: MediaFilter },
): SavedSearchRow {
  const name = input.name.trim();
  if (!name) throw new Error("A saved search needs a name.");
  const now = Date.now();
  db.prepare(
    `INSERT INTO saved_search (name, query, filter_json, created_at)
     VALUES (@name, @query, @filterJson, @createdAt)
     ON CONFLICT(name) DO UPDATE SET query = @query, filter_json = @filterJson`,
  ).run({
    name,
    query: input.query,
    filterJson: JSON.stringify(input.filter),
    createdAt: now,
  });
  return getSavedSearchByName(db, name)!;
}

function toRow(r: SavedSearchDbRow): SavedSearchRow {
  return {
    id: r.id,
    name: r.name,
    query: r.query,
    filter: parseSavedFilter(r.filter_json),
    created_at: r.created_at,
  };
}

export function getSavedSearchByName(
  db: SiftDatabase,
  name: string,
): SavedSearchRow | undefined {
  const row = db
    .prepare<SavedSearchDbRow>("SELECT * FROM saved_search WHERE name = ?")
    .get(name.trim());
  return row ? toRow(row) : undefined;
}

export function listSavedSearches(db: SiftDatabase): SavedSearchRow[] {
  return db
    .prepare<SavedSearchDbRow>(
      "SELECT * FROM saved_search ORDER BY name COLLATE NOCASE",
    )
    .all()
    .map(toRow);
}

export function deleteSavedSearch(db: SiftDatabase, id: number): void {
  db.prepare("DELETE FROM saved_search WHERE id = ?").run(id);
}
