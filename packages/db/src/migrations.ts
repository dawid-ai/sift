import type { SiftDatabase } from "./database";
import { migration001 } from "./migrations/001-asset.sql";
import { migration002 } from "./migrations/002-media.sql";
import { migration003 } from "./migrations/003-transcript.sql";
import { migration004Prompt } from "./migrations/004-prompt.sql";
import { migration005Summary } from "./migrations/005-summary.sql";
import { migration006 } from "./migrations/006-download.sql";
import { migration007 } from "./migrations/007-queue.sql";
import { migration008 } from "./migrations/008-channel.sql";
import { migration009 } from "./migrations/009-subscription.sql";
import { migration010 } from "./migrations/010-tag.sql";
import { migration011 } from "./migrations/011-media-channel-id.sql";
import { migration012 } from "./migrations/012-frame.sql";
import { migration013 } from "./migrations/013-frame-included.sql";
import { migration014 } from "./migrations/014-frame-crop.sql";
import { migration015 } from "./migrations/015-document.sql";
import { migration016 } from "./migrations/016-artifact-file-path.sql";
import { migration017CreatorPrompts } from "./migrations/017-creator-prompts.sql";

const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: migration001 },
  { version: 2, sql: migration002 },
  { version: 3, sql: migration003 },
  { version: 4, sql: migration004Prompt },
  { version: 5, sql: migration005Summary },
  { version: 6, sql: migration006 },
  { version: 7, sql: migration007 },
  { version: 8, sql: migration008 },
  { version: 9, sql: migration009 },
  { version: 10, sql: migration010 },
  { version: 11, sql: migration011 },
  { version: 12, sql: migration012 },
  { version: 13, sql: migration013 },
  { version: 14, sql: migration014 },
  { version: 15, sql: migration015 },
  { version: 16, sql: migration016 },
  { version: 17, sql: migration017CreatorPrompts },
];

// `migrations` param defaults to the real list; overridable so tests can inject a
// poison migration to prove each apply is atomic.
export function runMigrations(
  db: SiftDatabase,
  migrations: { version: number; sql: string }[] = MIGRATIONS,
): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const applied = new Set(
    db
      .prepare<{ version: number }>("SELECT version FROM schema_migrations")
      .all()
      .map((r) => r.version),
  );
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    // One transaction per migration: DDL + version-insert land together or not at
    // all. Without this, a crash between exec and insert re-runs the DDL next
    // launch → "duplicate column" → wedged startup. SQLite DDL is transactional.
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        m.version,
        Date.now(),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}
