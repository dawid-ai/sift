import type { SiftDatabase } from "./database";

export interface DownloadRow {
  id: number;
  media_id: number;
  format_id: string;
  label: string;
  ext: string | null;
  height: number | null;
  file_path: string | null;
  file_size: number | null;
  status: string;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export type NewDownload = Omit<DownloadRow, "id" | "created_at" | "updated_at">;

/** Distinct source_urls of media that have at least one completed download. Used to
 * flag "already downloaded" videos so we don't re-pull them. */
export function listDownloadedSourceUrls(db: SiftDatabase): string[] {
  return db
    .prepare<{ source_url: string }>(
      "SELECT DISTINCT m.source_url FROM media m JOIN download d ON d.media_id = m.id WHERE d.status = 'done'",
    )
    .all()
    .map((r) => r.source_url);
}

export function insertDownload(db: SiftDatabase, d: NewDownload): DownloadRow {
  const now = Date.now();
  const result = db
    .prepare(
      `INSERT INTO download (
         media_id, format_id, label, ext, height, file_path, file_size, status, error, created_at, updated_at
       ) VALUES (
         @media_id, @format_id, @label, @ext, @height, @file_path, @file_size, @status, @error, @created_at, @updated_at
       )`,
    )
    .run({
      ...d,
      created_at: now,
      updated_at: now,
    });
  return getDownloadById(db, Number(result.lastInsertRowid))!;
}

export function getDownloadById(db: SiftDatabase, id: number): DownloadRow | undefined {
  return db.prepare<DownloadRow>("SELECT * FROM download WHERE id = @id").get({ id });
}

export function getDownloadByMediaAndFormat(
  db: SiftDatabase,
  mediaId: number,
  formatId: string,
): DownloadRow | undefined {
  return db
    .prepare<DownloadRow>(
      "SELECT * FROM download WHERE media_id = @mediaId AND format_id = @formatId",
    )
    .get({ mediaId, formatId });
}

export function listDownloadsByMediaId(db: SiftDatabase, mediaId: number): DownloadRow[] {
  return db
    .prepare<DownloadRow>(
      "SELECT * FROM download WHERE media_id = @mediaId ORDER BY created_at DESC, id DESC",
    )
    .all({ mediaId });
}

export function upsertDownload(db: SiftDatabase, d: NewDownload): DownloadRow {
  const existing = getDownloadByMediaAndFormat(db, d.media_id, d.format_id);
  if (!existing) {
    return insertDownload(db, d);
  }
  db.prepare(
    `UPDATE download SET
       label = @label, ext = @ext, height = @height, file_path = @file_path,
       file_size = @file_size, status = @status, error = @error, updated_at = @updated_at
     WHERE id = @id`,
  ).run({
    id: existing.id,
    label: d.label,
    ext: d.ext,
    height: d.height,
    file_path: d.file_path,
    file_size: d.file_size,
    status: d.status,
    error: d.error,
    updated_at: Date.now(),
  });
  return getDownloadById(db, existing.id)!;
}

export function setDownloadStatus(
  db: SiftDatabase,
  id: number,
  status: string,
  filePath: string | null,
  fileSize: number | null,
  error: string | null,
): void {
  db.prepare(
    "UPDATE download SET status = ?, file_path = ?, file_size = ?, error = ?, updated_at = ? WHERE id = ?",
  ).run(status, filePath, fileSize, error, Date.now(), id);
}

/** Re-labels a download row (and records the height behind the label). Used when the
 * resolution is only discovered after the row exists — see the poster grab in
 * `main/ipc/import.ts`. */
export function setDownloadFormat(
  db: SiftDatabase,
  id: number,
  label: string,
  height: number | null,
): void {
  db.prepare("UPDATE download SET label = ?, height = ?, updated_at = ? WHERE id = ?").run(
    label,
    height,
    Date.now(),
    id,
  );
}

export function deleteDownload(db: SiftDatabase, id: number): void {
  db.prepare("DELETE FROM download WHERE id = ?").run(id);
}

export function resetDownloadingToError(db: SiftDatabase): number {
  const res = db
    .prepare(
      "UPDATE download SET status = 'error', error = @error, updated_at = @now WHERE status = 'downloading'",
    )
    .run({ error: "Interrupted", now: Date.now() });
  return res.changes;
}

/** True when any download row stores this exact file_path. The sift-media:// protocol
 * handler uses it as its security gate — only real downloads are ever served from disk. */
export function downloadExistsByFilePath(db: SiftDatabase, filePath: string): boolean {
  const row = db
    .prepare<{ n: number }>("SELECT COUNT(*) AS n FROM download WHERE file_path = @filePath")
    .get({ filePath });
  return (row?.n ?? 0) > 0;
}
