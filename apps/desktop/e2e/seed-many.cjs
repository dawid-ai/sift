// Standalone e2e seed helper — NOT app source, never imported by the app itself.
//
// pagination.spec.ts needs more media rows than the offline fixture would produce through the
// UI one download at a time. Same constraints/technique as seed-search-fixture.cjs: run *as*
// the Electron binary (ELECTRON_RUN_AS_NODE=1) so `require("better-sqlite3")` matches the ABI,
// then open the app's own sqlite file and insert plain rows via the same columns @sift/db uses.
"use strict";
const Database = require("better-sqlite3");

const [, , dbPath, countArg] = process.argv;
const count = Number(countArg);

const db = new Database(dbPath);
db.pragma("busy_timeout = 5000");
try {
  const insert = db.prepare(
    `INSERT INTO media (
       source_url, platform_id, external_id, title, uploader, uploader_url,
       duration_s, thumbnail_path, view_count, like_count, published_at,
       metadata_json, channel_id, download_path, download_status, created_at, updated_at
     ) VALUES (
       @source_url, @platform_id, @external_id, @title, @uploader, @uploader_url,
       @duration_s, @thumbnail_path, @view_count, @like_count, @published_at,
       @metadata_json, @channel_id, @download_path, @download_status, @created_at, @updated_at
     )`,
  );
  const base = Date.now();
  const tx = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      insert.run({
        source_url: `https://seed/${i}`,
        platform_id: "youtube",
        external_id: `seed-${i}`,
        title: `Bulk ${String(i).padStart(2, "0")}`,
        uploader: "Bulk Channel",
        uploader_url: null,
        duration_s: 60,
        thumbnail_path: null,
        view_count: null,
        like_count: null,
        published_at: null,
        metadata_json: "{}",
        channel_id: null,
        download_path: null,
        download_status: "none",
        created_at: base + i, // ascending so higher index = newer (top of the list)
        updated_at: base + i,
      });
    }
  });
  tx();
} finally {
  db.close();
}
