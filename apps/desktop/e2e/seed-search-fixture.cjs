// Standalone e2e seed helper — NOT app source, never imported by the app itself.
//
// library-search.spec.ts needs two things the offline fixture can't produce through the
// UI: a transcript unique to one media row (to test the text search + snippet), and a
// distinct uploader on the other row (to test the channel filter actually narrowing
// something). The fixture's yt-dlp/caption stubs (main/index.ts) return identical canned
// metadata/text for every URL, by design, for every other e2e spec.
//
// Playwright's `electronApplication.evaluate()` runs in a sandboxed V8 context with no
// `require`/dynamic `import` (verified: both are unavailable there), so the app's live
// `getDb()` can't be reached from inside it. A plain Node process can't load this repo's
// `better-sqlite3` binary either, since it's rebuilt against Electron's Node ABI. So this
// script is run *as* the Electron binary (via `ELECTRON_RUN_AS_NODE=1`, a standard Electron
// testing technique) purely to get a matching Node ABI for `require("better-sqlite3")`,
// then opens the app's own sqlite file (WAL mode; already tolerates a second connection)
// and runs the same two SQL statements `@sift/db`'s insertTranscript/media update helpers
// would run, reached by file path instead of an in-process handle.
"use strict";
const Database = require("better-sqlite3");

const [, , dbPath, urlA, urlB, transcriptText, otherUploader] = process.argv;

const db = new Database(dbPath);
db.pragma("busy_timeout = 5000");
try {
  const mediaA = db.prepare("SELECT id FROM media WHERE source_url = ?").get(urlA);
  const mediaB = db.prepare("SELECT id FROM media WHERE source_url = ?").get(urlB);
  if (!mediaA || !mediaB) {
    throw new Error(`Fixture media rows not found for ${urlA} / ${urlB}`);
  }

  db.prepare(
    `INSERT INTO transcript (media_id, provider_id, language, text, segments_json, model, created_at)
     VALUES (@media_id, @provider_id, @language, @text, @segments_json, @model, @created_at)`,
  ).run({
    media_id: mediaA.id,
    provider_id: "ytdlp-subs",
    language: "en",
    text: transcriptText,
    segments_json: "[]",
    model: null,
    created_at: Date.now(),
  });

  db.prepare("UPDATE media SET uploader = ? WHERE id = ?").run(otherUploader, mediaB.id);
} finally {
  db.close();
}
