import { describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";

describe("WASM test driver adapter", () => {
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

  // better-sqlite3 ignores named keys the statement does not declare, and call
  // sites lean on that: `.run({ ...row, id })` against an UPDATE that sets only
  // some of row's columns is the common shape. Verified against the Electron
  // build. The driver's own bind() throws on the surplus, so the adapter filters
  // by getParamIndex — if that emulation regresses, a dozen CRUD tests fail with
  // an opaque bind error rather than pointing here.
  it("ignores named params the statement does not declare", async () => {
    const db = await openTestDatabase();
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT)");
    db.prepare("INSERT INTO t (id, a) VALUES (@id, @a)").run({ id: 1, a: "x" });

    expect(() =>
      db
        .prepare("UPDATE t SET a = @a WHERE id = @id")
        .run({ id: 1, a: "z", notAColumn: "surplus" }),
    ).not.toThrow();

    expect(db.prepare<{ a: string }>("SELECT a FROM t").get()?.a).toBe("z");
    db.close();
  });

  // The reason this driver replaced sql.js: sql.js has no fts5 module, so any
  // full-text search work was untestable under Node.
  it("has FTS5, with bm25() and snippet()", async () => {
    const db = await openTestDatabase();
    db.exec("CREATE VIRTUAL TABLE fts USING fts5(title, body)");
    db.prepare("INSERT INTO fts VALUES (@t, @b)").run({
      t: "Backpressure",
      b: "gives you twenty times the queue depth, and you got twenty times slower.",
    });

    const hit = db
      .prepare<{ title: string; s: string }>(
        `SELECT title, snippet(fts, 1, '[', ']', '…', 6) AS s
           FROM fts WHERE fts MATCH @q ORDER BY bm25(fts)`,
      )
      .get({ q: "queue AND slower" });

    expect(hit?.title).toBe("Backpressure");
    expect(hit?.s).toContain("[queue]");
    db.close();
  });
});
