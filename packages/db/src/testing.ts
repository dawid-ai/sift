// Node-side test driver backed by sql.js (WASM). NEVER imported by the app —
// the app uses the native better-sqlite3 driver in `database.ts`. This exists so
// the driver-agnostic migration/asset/service logic can be unit-tested under Node
// (Node 24 has no better-sqlite3 prebuilt, and the Electron-ABI build can't load
// under Node). Both drivers are real SQLite, so the SQL under test is identical.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import type { SiftDatabase, Statement } from "./database";

const require = createRequire(import.meta.url);
let sqlModulePromise: ReturnType<typeof initSqlJs> | null = null;

function loadSql() {
  if (!sqlModulePromise) {
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    const buf = readFileSync(wasmPath);
    const wasmBinary = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    sqlModulePromise = initSqlJs({ wasmBinary });
  }
  return sqlModulePromise;
}

function isNamedParams(params: unknown[]): params is [Record<string, unknown>] {
  return (
    params.length === 1 &&
    typeof params[0] === "object" &&
    params[0] !== null &&
    !Array.isArray(params[0])
  );
}

// Our SQL uses better-sqlite3's `@name` params; sql.js wants `:name`.
function rewriteSql(sql: string): string {
  return sql.replace(/@(\w+)/g, ":$1");
}

function toBind(params: unknown[]): unknown {
  if (isNamedParams(params)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params[0])) out[`:${k}`] = v;
    return out;
  }
  return params;
}

/** In-memory SQLite via sql.js. Unit tests only. */
export async function openTestDatabase(): Promise<SiftDatabase> {
  const SQL = await loadSql();
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys = ON");
  return {
    exec: (sql) => db.run(rewriteSql(sql)),
    pragma: (source) => db.run(`PRAGMA ${source}`),
    close: () => db.close(),
    raw: db,
    prepare: <T>(sql: string): Statement<T> => {
      const text = rewriteSql(sql);
      return {
        get: (...params: unknown[]) => {
          const stmt = db.prepare(text);
          stmt.bind(toBind(params) as never);
          const row = stmt.step() ? (stmt.getAsObject() as T) : undefined;
          stmt.free();
          return row;
        },
        all: (...params: unknown[]) => {
          const stmt = db.prepare(text);
          stmt.bind(toBind(params) as never);
          const rows: T[] = [];
          while (stmt.step()) rows.push(stmt.getAsObject() as T);
          stmt.free();
          return rows;
        },
        run: (...params: unknown[]) => {
          db.run(text, toBind(params) as never);
          const idRes = db.exec("SELECT last_insert_rowid() AS id");
          const lastInsertRowid = Number(idRes[0]?.values[0]?.[0] ?? 0);
          return { changes: db.getRowsModified(), lastInsertRowid };
        },
      };
    },
  };
}
