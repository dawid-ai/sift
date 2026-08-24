import type { SiftDatabase } from "./database";

/** The stored shape. Mirrors `@sift/core`'s `ChannelRule`, plus the auto-queue watermark. */
export interface ChannelRuleRow {
  channel_id: string;
  enabled: boolean;
  min_duration_s: number | null;
  max_duration_s: number | null;
  keywords: string[];
  min_views: number | null;
  exclude_shorts: boolean;
  /** Newest external id already auto-queued, so a refresh never re-queues it. */
  last_queued_id: string | null;
  last_queued_at: number | null;
  updated_at: number;
}

interface DbRow {
  channel_id: string;
  enabled: number;
  min_duration_s: number | null;
  max_duration_s: number | null;
  keywords_json: string;
  min_views: number | null;
  exclude_shorts: number;
  last_queued_id: string | null;
  last_queued_at: number | null;
  updated_at: number;
}

function parseKeywordsJson(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((k): k is string => typeof k === "string")
      : [];
  } catch {
    // A hand-edited or truncated blob costs the keyword filter, not the whole rule.
    return [];
  }
}

function toRow(r: DbRow): ChannelRuleRow {
  return {
    channel_id: r.channel_id,
    enabled: r.enabled === 1,
    min_duration_s: r.min_duration_s,
    max_duration_s: r.max_duration_s,
    keywords: parseKeywordsJson(r.keywords_json),
    min_views: r.min_views,
    exclude_shorts: r.exclude_shorts === 1,
    last_queued_id: r.last_queued_id,
    last_queued_at: r.last_queued_at,
    updated_at: r.updated_at,
  };
}

export type ChannelRuleInput = Omit<
  ChannelRuleRow,
  "last_queued_id" | "last_queued_at" | "updated_at"
>;

/** Creates or replaces the rule for a channel. The watermark is preserved across edits. */
export function upsertChannelRule(
  db: SiftDatabase,
  input: ChannelRuleInput,
): ChannelRuleRow {
  db.prepare(
    `INSERT INTO channel_rule (
       channel_id, enabled, min_duration_s, max_duration_s, keywords_json,
       min_views, exclude_shorts, updated_at
     ) VALUES (
       @channel_id, @enabled, @min_duration_s, @max_duration_s, @keywords_json,
       @min_views, @exclude_shorts, @updated_at
     )
     ON CONFLICT(channel_id) DO UPDATE SET
       enabled = @enabled,
       min_duration_s = @min_duration_s,
       max_duration_s = @max_duration_s,
       keywords_json = @keywords_json,
       min_views = @min_views,
       exclude_shorts = @exclude_shorts,
       updated_at = @updated_at`,
  ).run({
    channel_id: input.channel_id,
    enabled: input.enabled ? 1 : 0,
    min_duration_s: input.min_duration_s,
    max_duration_s: input.max_duration_s,
    keywords_json: JSON.stringify(input.keywords),
    min_views: input.min_views,
    exclude_shorts: input.exclude_shorts ? 1 : 0,
    updated_at: Date.now(),
  });
  return getChannelRule(db, input.channel_id)!;
}

export function getChannelRule(
  db: SiftDatabase,
  channelId: string,
): ChannelRuleRow | undefined {
  const row = db
    .prepare<DbRow>("SELECT * FROM channel_rule WHERE channel_id = ?")
    .get(channelId);
  return row ? toRow(row) : undefined;
}

/** Every rule that is switched on — what the scheduler iterates. */
export function listEnabledChannelRules(db: SiftDatabase): ChannelRuleRow[] {
  return db
    .prepare<DbRow>("SELECT * FROM channel_rule WHERE enabled = 1")
    .all()
    .map(toRow);
}

export function listChannelRules(db: SiftDatabase): ChannelRuleRow[] {
  return db.prepare<DbRow>("SELECT * FROM channel_rule").all().map(toRow);
}

/** Records the newest upload auto-queued, so the next refresh starts after it. */
export function setChannelRuleWatermark(
  db: SiftDatabase,
  channelId: string,
  externalId: string,
): void {
  db.prepare(
    `UPDATE channel_rule SET last_queued_id = @externalId, last_queued_at = @now
       WHERE channel_id = @channelId`,
  ).run({ channelId, externalId, now: Date.now() });
}

export function deleteChannelRule(db: SiftDatabase, channelId: string): void {
  db.prepare("DELETE FROM channel_rule WHERE channel_id = ?").run(channelId);
}
