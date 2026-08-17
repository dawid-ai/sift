import type { SiftDatabase } from "./database";

export interface SubscriptionRow {
  id: number;
  channel_id: string;
  url: string;
  handle: string | null;
  title: string;
  avatar_url: string | null;
  follower_count: number | null;
  synced_at: number;
}

export type NewSubscription = Omit<SubscriptionRow, "id">;

export function upsertSubscription(
  db: SiftDatabase,
  s: NewSubscription,
): SubscriptionRow {
  const existing = db
    .prepare<SubscriptionRow>(
      "SELECT * FROM subscription WHERE channel_id = @channel_id",
    )
    .get({ channel_id: s.channel_id });
  if (!existing) {
    const r = db
      .prepare(
        `INSERT INTO subscription (channel_id, url, handle, title, avatar_url, follower_count, synced_at)
         VALUES (@channel_id, @url, @handle, @title, @avatar_url, @follower_count, @synced_at)`,
      )
      .run(s);
    return db
      .prepare<SubscriptionRow>("SELECT * FROM subscription WHERE id = @id")
      .get({ id: Number(r.lastInsertRowid) })!;
  }
  db.prepare(
    `UPDATE subscription SET url=@url, handle=@handle, title=@title, avatar_url=@avatar_url,
       follower_count=@follower_count, synced_at=@synced_at WHERE id=@id`,
  ).run({ ...s, id: existing.id });
  return db
    .prepare<SubscriptionRow>("SELECT * FROM subscription WHERE id = @id")
    .get({ id: existing.id })!;
}

export function listSubscriptions(db: SiftDatabase): SubscriptionRow[] {
  return db
    .prepare<SubscriptionRow>(
      "SELECT * FROM subscription ORDER BY title COLLATE NOCASE, id",
    )
    .all();
}

/** Upserts every row AND deletes rows whose channel_id is absent from `rows` (feed = source of truth). */
export function replaceSubscriptions(
  db: SiftDatabase,
  rows: NewSubscription[],
): void {
  // No transaction wrapper: SiftDatabase exposes only exec/prepare (no `.transaction`),
  // matching every other db module (channel.ts, download.ts) which write inline.
  for (const r of rows) upsertSubscription(db, r);
  const keep = rows.map((r) => r.channel_id);
  if (keep.length === 0) {
    db.prepare("DELETE FROM subscription").run();
  } else {
    // Named params @k0,@k1,… (this codebase's Statement.run takes a named-param object, not positional ?).
    const binds: Record<string, string> = {};
    keep.forEach((id, i) => {
      binds["k" + i] = id;
    });
    const clause = keep.map((_, i) => "@k" + i).join(",");
    db.prepare(
      `DELETE FROM subscription WHERE channel_id NOT IN (${clause})`,
    ).run(binds);
  }
}

export function clearSubscriptions(db: SiftDatabase): void {
  db.prepare("DELETE FROM subscription").run();
}
