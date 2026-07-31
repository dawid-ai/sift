import BetterSqlite3 from "better-sqlite3";

export interface Statement<T> {
  get(...params: unknown[]): T | undefined;
  all(...params: unknown[]): T[];
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}

export interface SiftDatabase {
  exec(sql: string): void;
  prepare<T = unknown>(sql: string): Statement<T>;
  pragma(source: string): unknown;
  close(): void;
  /** Underlying driver handle. Typed `unknown` to keep the driver swappable. */
  readonly raw: unknown;
}

/** Open (creating if needed) a SQLite database at `filePath`. Use ":memory:" for tests. */
export function openDatabase(filePath: string): SiftDatabase {
  const db = new BetterSqlite3(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return {
    exec: (sql) => void db.exec(sql),
    prepare: <T>(sql: string) => db.prepare(sql) as unknown as Statement<T>,
    pragma: (source) => db.pragma(source),
    close: () => db.close(),
    raw: db,
  };
}
