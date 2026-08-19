// Node-side test driver backed by the official SQLite WASM build. NEVER imported
// by the app — the app uses the native better-sqlite3 driver in `database.ts`.
// This exists so the driver-agnostic migration/asset/service logic can be
// unit-tested under Node (Node has no better-sqlite3 prebuilt here, and the
// Electron-ABI build can't load under Node). Both drivers are real SQLite, so
// the SQL under test is identical.
//
// WHY NOT sql.js: it is compiled without FTS5 — `CREATE VIRTUAL TABLE ... USING
// fts5` fails with "no such module: fts5" — so any full-text search work would
// have been untestable under Node. The official build ships FTS5 (with bm25()
// and snippet()) as standard. It also binds SQLite's native `@name` parameters
// directly, which retires the `@`->`:` query rewrite the sql.js layer needed.
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { SiftDatabase, Statement } from "./database";

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>;
type OoDb = InstanceType<Sqlite3["oo1"]["DB"]>;
type OoStmt = ReturnType<OoDb["prepare"]>;

let modulePromise: ReturnType<typeof sqlite3InitModule> | null = null;

function loadSqlite() {
  modulePromise ??= sqlite3InitModule();
  return modulePromise;
}

function isNamedParams(params: unknown[]): params is [Record<string, unknown>] {
  return (
    params.length === 1 &&
    typeof params[0] === "object" &&
    params[0] !== null &&
    !Array.isArray(params[0])
  );
}

/**
 * Bind a parameter set the way better-sqlite3 does.
 *
 * Two behaviours have to be matched, and both were free under sql.js:
 *
 *  1. Call sites pass BARE keys (`{ id: 1 }`) against `@name` SQL, so the sigil
 *     is re-attached here rather than at ~200 call sites.
 *  2. Call sites pass EXTRA keys the statement does not declare — the common
 *     shape being `.run({ ...row, id })` against an UPDATE that sets only some
 *     of `row`'s columns. better-sqlite3 ignores the surplus (verified against
 *     the Electron build); this driver's bind() throws on it. So each key is
 *     resolved with getParamIndex() and skipped when the statement has no such
 *     parameter, which is an exact emulation rather than a regex guess at which
 *     `@name`s are real (a regex would also match inside string literals).
 */
function bindParams(stmt: OoStmt, params: unknown[]): void {
  if (!params.length) return;
  if (isNamedParams(params)) {
    for (const [k, v] of Object.entries(params[0])) {
      const idx = stmt.getParamIndex(k.startsWith("@") ? k : `@${k}`);
      if (idx) stmt.bind(idx, (v ?? null) as never);
    }
    return;
  }
  stmt.bind(params.map((p) => p ?? null) as never);
}

/** In-memory SQLite via the official WASM build. Unit tests only. */
export async function openTestDatabase(): Promise<SiftDatabase> {
  const sqlite3 = await loadSqlite();
  const db: OoDb = new sqlite3.oo1.DB(":memory:");
  db.exec("PRAGMA foreign_keys = ON");

  const lastInsertRowid = (): number => {
    let id = 0;
    db.exec({
      sql: "SELECT last_insert_rowid() AS id",
      rowMode: "object",
      callback: (r: Record<string, unknown>) => void (id = Number(r.id ?? 0)),
    });
    return id;
  };

  return {
    exec: (sql) => void db.exec(sql),
    pragma: (source) => void db.exec(`PRAGMA ${source}`),
    close: () => db.close(),
    raw: db,
    prepare: <T>(sql: string): Statement<T> => ({
      get: (...params: unknown[]) => {
        const stmt = db.prepare(sql);
        try {
          bindParams(stmt, params);
          return stmt.step() ? (stmt.get({}) as T) : undefined;
        } finally {
          stmt.finalize();
        }
      },
      all: (...params: unknown[]) => {
        const stmt = db.prepare(sql);
        try {
          bindParams(stmt, params);
          const rows: T[] = [];
          while (stmt.step()) rows.push(stmt.get({}) as T);
          return rows;
        } finally {
          stmt.finalize();
        }
      },
      run: (...params: unknown[]) => {
        const stmt = db.prepare(sql);
        try {
          bindParams(stmt, params);
          stmt.step();
        } finally {
          stmt.finalize();
        }
        return { changes: db.changes(), lastInsertRowid: lastInsertRowid() };
      },
    }),
  };
}
