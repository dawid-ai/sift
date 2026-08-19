import type { SiftDatabase } from "./database";

export interface PlaylistEntry {
  mediaId: number;
  title: string;
  uploader: string | null;
  durationSec: number | null;
  filePath: string;
}

/**
 * Resolves the given media ids to one playlist entry each: the newest done
 * download (greatest download.id) with a non-null file_path. Media without such
 * a download are omitted. Order follows media.id (not display-authoritative).
 */
export function listPlaylistEntries(
  db: SiftDatabase,
  mediaIds: number[],
): PlaylistEntry[] {
  if (mediaIds.length === 0) return [];
  // Named params (the repo's convention) — works on both better-sqlite3 and the
  // WASM test driver. Build @id0,@id1,… placeholders + a matching params object.
  const params: Record<string, number> = {};
  const placeholders = mediaIds
    .map((id, i) => {
      params[`id${i}`] = id;
      return `@id${i}`;
    })
    .join(",");

  return db
    .prepare<PlaylistEntry>(
      `SELECT m.id AS mediaId, m.title AS title, m.uploader AS uploader,
              m.duration_s AS durationSec, d.file_path AS filePath
         FROM media m
         JOIN download d ON d.media_id = m.id
        WHERE d.status = 'done'
          AND d.file_path IS NOT NULL
          AND d.id = (SELECT MAX(d2.id) FROM download d2
                       WHERE d2.media_id = m.id AND d2.status = 'done' AND d2.file_path IS NOT NULL)
          AND m.id IN (${placeholders})
        ORDER BY m.id`,
    )
    .all(params);
}
