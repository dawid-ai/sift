import type { SiftDatabase } from "./database";

export interface SearchHit {
  mediaId: number;
  field: "title" | "uploader" | "transcript" | "summary";
  snippet: string | null;
}

export interface SearchOptions {
  /**
   * Search inside transcripts and summaries too, not just title and uploader.
   *
   * OFF BY DEFAULT. Searching the spoken text is the whole point of keeping it,
   * but it is the wrong default for a box that runs on every keystroke: most
   * lookups are for a video the user can already half-name, and against the full
   * text those return a pile of videos that merely say the word in passing,
   * burying the one whose title is the answer.
   */
  includeText?: boolean;
}

/** Terms beyond this are ignored, to bound the MATCH expression. */
const MAX_TERMS = 8;

interface Row {
  mediaId: number;
  title: string;
  uploader: string | null;
  t_snip: string | null;
  s_snip: string | null;
}

/**
 * Turn arbitrary user input into a safe FTS5 MATCH expression.
 *
 * This is the sharp edge of FTS5: MATCH takes a query *language*, not a string,
 * so raw input is not merely wrong, it throws. `p99:` is a column filter naming a
 * column that does not exist, `C++` is a syntax error, a trailing `AND` is a
 * dangling operator. Any of them turn a search box into a stack trace.
 *
 * Quoting each term as a phrase disarms all of it: inside double quotes every
 * character is literal, FTS5 tokenizes the contents itself, and the only escape
 * that matters is a doubled `"`. Terms are then AND-ed, which preserves the
 * whitespace-is-AND behaviour the substring implementation had.
 *
 * EVERY TERM IS A PREFIX (the trailing `*`), and that is not a nicety. The
 * library search box is debounced search-as-you-type, so a query is read on every
 * keystroke and is a partial word most of the time it runs. Matching whole tokens
 * only, typing "verita" would show nothing at all until the final "m" of
 * "Veritasium" landed. Note this is still strictly tighter than the substring
 * scan it replaces: a prefix anchors to the start of a token, so "cat" matches
 * "catalog" but no longer matches "concatenate" or "application".
 *
 * Returns null when nothing survives (empty input, or input that is entirely
 * punctuation) so the caller can return no hits rather than run a MATCH that
 * would error.
 */
export function toMatchExpr(query: string, includeText = false): string | null {
  const terms = query
    .trim()
    .split(/\s+/)
    // A term needs at least one character the tokenizer keeps, or it contributes
    // an empty phrase and matches everything.
    .filter((t) => /[\p{L}\p{N}]/u.test(t))
    .slice(0, MAX_TERMS)
    .map((t) => `"${t.replace(/"/g, '""')}"*`);
  if (!terms.length) return null;
  const expr = terms.join(" AND ");
  // A column filter, rather than a different table or query: FTS5 scopes the
  // whole parenthesised expression to the named columns, so the two modes share
  // one index and one code path.
  return includeText ? expr : `{title uploader} : (${expr})`;
}

/** The literal first term, used to locate the snippet window. */
function firstTerm(query: string): string {
  return (
    query
      .trim()
      .split(/\s+/)
      .find((t) => /[\p{L}\p{N}]/u.test(t)) ?? ""
  ).toLowerCase();
}

/**
 * Full-text search across title, uploader, transcript and summary, ranked by
 * relevance. One hit per media.
 *
 * ORDER IS RELEVANCE, NOT RECENCY. This used to be `ORDER BY m.created_at DESC`,
 * which is the right answer for browsing and the wrong one for searching: once a
 * phrase matches thirty videos, "newest first" buries the video the phrase is
 * actually about under whatever happened to be added last.
 *
 * THE SNIPPET IS NOT FTS5’s snippet(). It looks like the obvious tool and it is
 * the reason this query was unusable: snippet() re-tokenizes the whole column to
 * locate matches, so calling it on four columns cost ~5ms PER ROW regardless of
 * how short the query was. Measured against 6k-word transcripts:
 *
 *   videos   MATCH+bm25 only   +4x snippet()   +instr/substr (this)
 *      300              2 ms         619 ms                18 ms
 *     1000             10 ms        2562 ms                66 ms
 *
 * Since the box fires on every keystroke, that was seconds of freeze per letter
 * on a library of a few hundred. FTS5 still does what it is good at — matching and
 * ranking — and the excerpt is cut with instr/substr, which is what the pre-index
 * implementation used and is effectively free. The window is computed in SQL so
 * full transcript bodies never leave the DB.
 *
 * One cosmetic consequence: the window is found by literal substring, so a hit
 * that matched only through the tokenizer’s diacritic folding (searching
 * "typage" against "typagé") still ranks correctly but comes back without a
 * snippet. The row is never lost, only its excerpt.
 *
 * Not paginated on purpose: the caller keys a Map by mediaId to filter the whole
 * library, so it needs every id. The id-only floor is 10ms at 1000 videos, and
 * the ceiling worth knowing is that this grows linearly — revisit if a library
 * ever reaches tens of thousands.
 */
export function searchMedia(
  db: SiftDatabase,
  query: string,
  { includeText = false }: SearchOptions = {},
): SearchHit[] {
  const match = toMatchExpr(query, includeText);
  if (!match) return [];
  const term = firstTerm(query);

  // With text search off there is nothing to excerpt -- a title or uploader hit
  // never carried a snippet -- so the two correlated subqueries are dropped
  // rather than run and discarded.
  const snippets = includeText
    ? `(SELECT substr(t.text, max(1, instr(lower(t.text), @term) - 30), 80)
                 FROM transcript t
                WHERE t.media_id = f.media_id AND instr(lower(t.text), @term) > 0
                ORDER BY t.id LIMIT 1) AS t_snip,
              (SELECT substr(s.text, max(1, instr(lower(s.text), @term) - 30), 80)
                 FROM summary s
                WHERE s.media_id = f.media_id AND instr(lower(s.text), @term) > 0
                ORDER BY s.id LIMIT 1) AS s_snip`
    : `NULL AS t_snip, NULL AS s_snip`;

  const rows = db
    .prepare<Row>(
      `SELECT f.media_id AS mediaId,
              m.title    AS title,
              m.uploader AS uploader,
              ${snippets}
         FROM media_fts f
         JOIN media m ON m.id = f.media_id
        WHERE media_fts MATCH @q
        ORDER BY bm25(media_fts)`,
    )
    .all({ q: match, term });

  return rows.map((r) => toHit(r, term));
}

function toHit(r: Row, term: string): SearchHit {
  // Priority matches the old implementation: a title hit outranks a body hit.
  if (r.title.toLowerCase().includes(term))
    return { mediaId: r.mediaId, field: "title", snippet: null };
  if (r.uploader && r.uploader.toLowerCase().includes(term))
    return { mediaId: r.mediaId, field: "uploader", snippet: null };
  if (r.t_snip != null)
    return {
      mediaId: r.mediaId,
      field: "transcript",
      snippet: ellipsize(r.t_snip),
    };
  if (r.s_snip != null)
    return {
      mediaId: r.mediaId,
      field: "summary",
      snippet: ellipsize(r.s_snip),
    };
  // Reachable: every term matched somewhere, but the FIRST term may have matched
  // a different field, or matched only after diacritic folding.
  return { mediaId: r.mediaId, field: "title", snippet: null };
}

/** Wrap a mid-text window in ellipses (the window is centered on the match). */
function ellipsize(s: string): string {
  return `…${s.trim()}…`;
}
