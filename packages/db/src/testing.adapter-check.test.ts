import { describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";

describe("sql.js test driver adapter", () => {
  it("handles DDL, named + positional params, upsert, and PRAGMA", async () => {
    const db = await openTestDatabase();
    db.exec(
      `CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT UNIQUE, n INTEGER)`,
    );

    // named params (@name style, like better-sqlite3)
    db.prepare(`INSERT INTO t (kind, n) VALUES (@kind, @n)`).run({
      kind: "a",
      n: 1,
    });
    // upsert on the same kind
    db.prepare(
      `INSERT INTO t (kind, n) VALUES (@kind, @n)
       ON CONFLICT(kind) DO UPDATE SET n = excluded.n`,
    ).run({ kind: "a", n: 2 });

    const row = db
      .prepare<{ kind: string; n: number }>(
        "SELECT kind, n FROM t WHERE kind = ?",
      )
      .get("a");
    expect(row?.n).toBe(2);

    const all = db.prepare<{ kind: string }>("SELECT kind FROM t").all();
    expect(all).toHaveLength(1); // upsert, not a second row

    // positional insert + last_insert_rowid + changes
    const res = db.prepare("INSERT INTO t (kind, n) VALUES (?, ?)").run("b", 5);
    expect(res.changes).toBe(1);
    expect(Number(res.lastInsertRowid)).toBeGreaterThan(0);

    // PRAGMA table_info as a query
    const cols = db
      .prepare<{ name: string }>("PRAGMA table_info(t)")
      .all()
      .map((c) => c.name);
    expect(cols).toContain("kind");

    db.close();
  });
});
