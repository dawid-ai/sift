import type { SiftDatabase } from "./database";

export type AssetKind = "ytdlp" | "ffmpeg" | "whisper" | "deno";

export interface AssetRow {
  id: number;
  kind: AssetKind;
  name: string;
  version: string;
  path: string;
  sha256: string;
  installed_at: number;
  last_checked: number;
}

export function upsertAsset(
  db: SiftDatabase,
  input: Omit<AssetRow, "id">,
): AssetRow {
  db.prepare(
    `INSERT INTO asset (kind, name, version, path, sha256, installed_at, last_checked)
     VALUES (@kind, @name, @version, @path, @sha256, @installed_at, @last_checked)
     ON CONFLICT(kind) DO UPDATE SET
       name=excluded.name, version=excluded.version, path=excluded.path,
       sha256=excluded.sha256, installed_at=excluded.installed_at,
       last_checked=excluded.last_checked`,
  ).run(input);
  return getAsset(db, input.kind)!;
}

export function getAsset(
  db: SiftDatabase,
  kind: AssetKind,
): AssetRow | undefined {
  return db.prepare<AssetRow>("SELECT * FROM asset WHERE kind = ?").get(kind);
}

export function listAssets(db: SiftDatabase): AssetRow[] {
  return db.prepare<AssetRow>("SELECT * FROM asset ORDER BY kind").all();
}

export function touchAssetChecked(
  db: SiftDatabase,
  kind: AssetKind,
  at: number,
): void {
  db.prepare("UPDATE asset SET last_checked = ? WHERE kind = ?").run(at, kind);
}
