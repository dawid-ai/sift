import type { SiftDatabase } from "./database";

/** One video of a channel's catalogue, as of the last stats sync. */
export interface ChannelVideoRow {
  channel_id: string;
  external_id: string;
  content_type: string;
  url: string;
  title: string;
  duration_s: number | null;
  view_count: number | null;
  is_short: number;
  position: number;
  first_seen: number;
  last_seen: number;
}

export type NewChannelVideo = Omit<
  ChannelVideoRow,
  "channel_id" | "content_type" | "first_seen" | "last_seen" | "position"
>;

/**
 * Writes one content tab's listing, newest first.
 *
 * Upsert rather than delete-then-insert: a video that later goes private drops out of the
 * listing, and keeping its last known row is more useful than losing the stat. `first_seen`
 * survives the update, so it doubles as "when Sift first saw this video".
 */
export function upsertChannelVideos(
  db: SiftDatabase,
  channelId: string,
  contentType: string,
  videos: NewChannelVideo[],
  now: number = Date.now(),
): number {
  const stmt = db.prepare(
    `INSERT INTO channel_video (channel_id, external_id, content_type, url, title,
       duration_s, view_count, is_short, position, first_seen, last_seen)
     VALUES (@channel_id, @external_id, @content_type, @url, @title,
       @duration_s, @view_count, @is_short, @position, @now, @now)
     ON CONFLICT(channel_id, external_id) DO UPDATE SET
       content_type=excluded.content_type, url=excluded.url, title=excluded.title,
       duration_s=excluded.duration_s, view_count=excluded.view_count,
       is_short=excluded.is_short, position=excluded.position, last_seen=excluded.last_seen`,
  );
  db.exec("BEGIN");
  try {
    videos.forEach((v, i) =>
      stmt.run({
        ...v,
        channel_id: channelId,
        content_type: contentType,
        position: i,
        now,
      }),
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return videos.length;
}

/** The catalogue for one content tab, newest first. */
export function listChannelVideos(
  db: SiftDatabase,
  channelId: string,
  contentType: string,
): ChannelVideoRow[] {
  return db
    .prepare<ChannelVideoRow>(
      `SELECT * FROM channel_video WHERE channel_id = @channelId AND content_type = @contentType
       ORDER BY position ASC`,
    )
    .all({ channelId, contentType });
}

/** Every known view count for one content tab. The median baseline is computed from this. */
export function listChannelViewCounts(
  db: SiftDatabase,
  channelId: string,
  contentType: string,
): number[] {
  return db
    .prepare<{ view_count: number }>(
      `SELECT view_count FROM channel_video
       WHERE channel_id = @channelId AND content_type = @contentType AND view_count IS NOT NULL`,
    )
    .all({ channelId, contentType })
    .map((r) => r.view_count);
}

export function countChannelVideos(
  db: SiftDatabase,
  channelId: string,
  contentType: string,
): number {
  return (
    db
      .prepare<{ n: number }>(
        `SELECT COUNT(*) AS n FROM channel_video
         WHERE channel_id = @channelId AND content_type = @contentType`,
      )
      .get({ channelId, contentType })?.n ?? 0
  );
}

export function deleteChannelVideos(db: SiftDatabase, channelId: string): void {
  db.prepare("DELETE FROM channel_video WHERE channel_id = ?").run(channelId);
}
