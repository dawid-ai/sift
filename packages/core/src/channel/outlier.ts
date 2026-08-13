// Pure + dependency-free, like the rest of core/channel.
//
// ponytail: a video's score is views ÷ the median views of the videos currently listed, with
// no age normalisation — yt-dlp's flat channel listing carries no upload date, and fetching
// per-video dates for a 200-video pool is a separate (slow) request per video. An old evergreen
// hit therefore reads as an outlier. Position in the newest-first list is the age proxy the UI
// gives the user. If real age normalisation ever matters, persist upload dates first — and note
// `media.published_at` (packages/db/src/migrations/002-media.sql.ts) is declared INTEGER while
// the only value yt-dlp gives per-video is `upload_date`, a "YYYYMMDD" string, so every insert
// site writes null there today; a backfill/column-type fix has to land before this column is
// usable as that date source.

/** Videos this many times the channel median count as outliers. */
export const OUTLIER_THRESHOLD = 2;

/** Median view count across the videos that have one, or null if none do. */
export function medianViews(videos: { viewCount: number | null }[]): number | null {
  const counts = videos
    .map((v) => v.viewCount)
    .filter((c): c is number => typeof c === "number")
    .sort((a, b) => a - b);
  if (counts.length === 0) return null;
  const mid = Math.floor(counts.length / 2);
  return counts.length % 2 === 1 ? counts[mid]! : (counts[mid - 1]! + counts[mid]!) / 2;
}

/** How many times the channel median this video got. Null when it can't be computed. */
export function outlierScore(viewCount: number | null, median: number | null): number | null {
  if (viewCount == null || median == null || median <= 0) return null;
  return viewCount / median;
}
