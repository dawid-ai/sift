import type { SiftDatabase } from "./database";

export interface SearchHit {
  mediaId: number;
  field: "title" | "uploader" | "transcript" | "summary";
  snippet: string | null;
}

interface Row {
  mediaId: number;
  title: string;
  uploader: string | null;
  t_snip: string | null;
  s_snip: string | null;
}

/**
 * Substring search (case-insensitive for ASCII) across title, uploader,
 * transcript text, and summary text. One hit per matching media, newest first.
 * Snippet (~80-char window, ellipsized) is returned only for transcript/summary
 * hits — title/uploader are already visible on the row, so their snippet is null.
 * Uses instr/substr/lower (core SQLite) so it runs on both DB drivers.
 */
export function searchMedia(db: SiftDatabase, query: string): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const lq = q.toLowerCase();

  // Snippet window is computed in SQL so full transcript/summary bodies never
  // leave the DB: substr(text, max(1, matchPos - 30), 80).
  const rows = db
    .prepare<Row>(
      `SELECT
         m.id AS mediaId,
         m.title AS title,
         m.uploader AS uploader,
         (SELECT substr(t.text, max(1, instr(lower(t.text), @q) - 30), 80)
            FROM transcript t
            WHERE t.media_id = m.id AND instr(lower(t.text), @q) > 0
            ORDER BY t.id LIMIT 1) AS t_snip,
         (SELECT substr(s.text, max(1, instr(lower(s.text), @q) - 30), 80)
            FROM summary s
            WHERE s.media_id = m.id AND instr(lower(s.text), @q) > 0
            ORDER BY s.id LIMIT 1) AS s_snip
       FROM media m
       WHERE instr(lower(m.title), @q) > 0
          OR instr(lower(COALESCE(m.uploader, '')), @q) > 0
          OR EXISTS (SELECT 1 FROM transcript t WHERE t.media_id = m.id AND instr(lower(t.text), @q) > 0)
          OR EXISTS (SELECT 1 FROM summary s WHERE s.media_id = m.id AND instr(lower(s.text), @q) > 0)
       ORDER BY m.created_at DESC`,
    )
    .all({ q: lq });

  return rows.map((r) => toHit(r, lq));
}

function toHit(r: Row, lq: string): SearchHit {
  if (r.title.toLowerCase().includes(lq))
    return { mediaId: r.mediaId, field: "title", snippet: null };
  if (r.uploader && r.uploader.toLowerCase().includes(lq))
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
  // WHERE guarantees a match; unreachable, but keep the return total.
  return { mediaId: r.mediaId, field: "title", snippet: null };
}

/** Wrap a mid-text window in ellipses (personal-app polish; the window is centered on the match). */
function ellipsize(s: string): string {
  return `…${s.trim()}…`;
}
