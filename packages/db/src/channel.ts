import type { SiftDatabase } from "./database";

export interface ChannelRow {
  id: number;
  channel_id: string;
  url: string;
  handle: string | null;
  title: string;
  description: string | null;
  uploader: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  follower_count: number | null;
  video_count: number | null;
  last_seen_video_id: string | null;
  new_count: number;
  last_checked: number | null;
  created_at: number;
}

export type NewChannel = Omit<ChannelRow, "id" | "created_at">;

export function insertChannel(db: SiftDatabase, c: NewChannel): ChannelRow {
  const created_at = Date.now();
  const r = db
    .prepare(
      `INSERT INTO channel (channel_id, url, handle, title, description, uploader, avatar_url,
         banner_url, follower_count, video_count, last_seen_video_id, new_count, last_checked, created_at)
       VALUES (@channel_id, @url, @handle, @title, @description, @uploader, @avatar_url,
         @banner_url, @follower_count, @video_count, @last_seen_video_id, @new_count, @last_checked, @created_at)`,
    )
    .run({ ...c, created_at });
  return getChannelById(db, Number(r.lastInsertRowid))!;
}

export function getChannelById(
  db: SiftDatabase,
  id: number,
): ChannelRow | undefined {
  return db
    .prepare<ChannelRow>("SELECT * FROM channel WHERE id = @id")
    .get({ id });
}

export function getChannelByChannelId(
  db: SiftDatabase,
  channelId: string,
): ChannelRow | undefined {
  return db
    .prepare<ChannelRow>("SELECT * FROM channel WHERE channel_id = @channelId")
    .get({ channelId });
}

export function listChannels(db: SiftDatabase): ChannelRow[] {
  return db
    .prepare<ChannelRow>(
      "SELECT * FROM channel ORDER BY created_at DESC, id DESC",
    )
    .all();
}

export function upsertChannel(db: SiftDatabase, c: NewChannel): ChannelRow {
  const existing = getChannelByChannelId(db, c.channel_id);
  if (!existing) return insertChannel(db, c);
  db.prepare(
    `UPDATE channel SET url=@url, handle=@handle, title=@title, description=@description,
       uploader=@uploader, avatar_url=@avatar_url, banner_url=@banner_url,
       follower_count=@follower_count, video_count=@video_count,
       last_seen_video_id=@last_seen_video_id, new_count=@new_count, last_checked=@last_checked
     WHERE id=@id`,
  ).run({ ...c, id: existing.id });
  return getChannelById(db, existing.id)!;
}

export function updateChannelRefresh(
  db: SiftDatabase,
  id: number,
  patch: {
    last_seen_video_id: string | null;
    new_count: number;
    last_checked: number;
  },
): void {
  db.prepare(
    "UPDATE channel SET last_seen_video_id=@last_seen_video_id, new_count=@new_count, last_checked=@last_checked WHERE id=@id",
  ).run({ id, ...patch });
}

export function deleteChannel(db: SiftDatabase, id: number): void {
  db.prepare("DELETE FROM channel WHERE id = ?").run(id);
}
