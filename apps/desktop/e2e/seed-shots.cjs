// Standalone visual-QA seed helper — NOT app source, never imported by the app.
//
// shots.spec.ts captures the UI for design review. Against the bare offline fixture the
// library holds a single row, so every screenshot showed acres of empty table and stat
// tiles reading "0" — which reads as a design failure when it is really a data artifact.
// This seeds a plausible library (varied platforms, channels, durations, languages, tags,
// transcripts and summaries) so the shots exercise real density. It also seeds tracked
// channels and queue items — without those, the Channels and Queue captures showed only
// their empty states, so a third of the reviewable surfaces carried no design signal.
//
// Same constraints/technique as seed-many.cjs: run *as* the Electron binary
// (ELECTRON_RUN_AS_NODE=1) so `require("better-sqlite3")` matches the ABI, then open the
// app's own sqlite file and insert plain rows via the columns @sift/db uses.
"use strict";
const Database = require("better-sqlite3");

const [, , dbPath] = process.argv;

const ROWS = [
  ["Designing Data-Intensive Applications — the talk", "Martin Kleppmann", "youtube", 3182, "en", ["systems", "data"], true, true],
  ["Rust for the impatient JavaScript developer", "No Boilerplate", "youtube", 984, "en", ["rust"], true, true],
  ["How Postgres query planning actually works", "PGConf", "youtube", 2745, "en", ["postgres", "data"], true, false],
  ["The case against microservices", "GOTO Conferences", "youtube", 2410, "en", ["architecture"], true, true],
  ["Building a compiler in 200 lines", "Tsoding Daily", "twitch", 7220, "en", ["compilers"], true, false],
  ["Local-first software: you own your data", "Ink & Switch", "vimeo", 1855, "en", ["local-first"], true, true],
  ["CSS layout is a solved problem (it isn't)", "Kevin Powell", "youtube", 1122, "en", ["css", "frontend"], true, false],
  ["Why your tests are slow", "Dave Farley", "youtube", 1043, "en", ["testing"], true, true],
  ["Электроника и схемотехника — основы", "Радиолюбитель", "youtube", 2260, "ru", ["hardware"], true, false],
  ["Le typage statique expliqué simplement", "Grafikart", "youtube", 1640, "fr", ["typescript"], true, false],
  ["SQLite is not a toy database", "Ben Johnson", "youtube", 1390, "en", ["sqlite", "data"], true, true],
  ["Shipping an Electron app that isn't bloated", "Electron Meetup", "youtube", 2015, "en", ["electron"], true, false],
  ["The hidden cost of abstraction", "Casey Muratori", "youtube", 4880, "en", ["performance"], true, true],
  ["Whisper, wav2vec and the state of ASR", "Hugging Face", "youtube", 2530, "en", ["ml", "audio"], true, false],
  ["A gentle introduction to WebGPU", "Surma", "youtube", 1780, "en", ["graphics"], true, true],
  ["Refactoring legacy code without fear", "Emily Bache", "vimeo", 2190, "en", ["refactoring"], true, false],
  ["Der Weg zu sauberem Code", "Programmieren lernen", "youtube", 1465, "de", ["clean-code"], false, false],
  ["Interviewing the yt-dlp maintainers", "The Changelog", "soundcloud", 3640, "en", ["podcast"], true, true],
  ["Type-level programming is a trap", "Matt Pocock", "youtube", 903, "en", ["typescript"], true, false],
  ["Everything I know about caching", "ByteByteGo", "youtube", 1268, "en", ["systems"], true, true],
  ["Ffmpeg filters from first principles", "Video Tech", "youtube", 2960, "en", ["ffmpeg", "video"], true, false],
  ["Why I stopped using an ORM", "Coding Garden", "twitch", 5410, "en", ["data"], false, false],
  ["Accessibility beyond the checklist", "Smashing Magazine", "vimeo", 2085, "en", ["a11y", "frontend"], true, true],
  ["The economics of open source maintenance", "FOSDEM", "youtube", 1720, "en", ["oss"], true, false],
  ["Tailwind, three years later", "Adam Wathan", "youtube", 1995, "en", ["css", "frontend"], true, true],
  ["Debugging production without a debugger", "Strange Loop", "youtube", 2340, "en", ["debugging"], true, false],
  ["Building offline-first mobile sync", "Local-First Conf", "vimeo", 1610, "en", ["local-first", "sync"], true, true],
  ["What every programmer should know about memory", "Ulrich Drepper Reads", "youtube", 6120, "en", ["performance"], true, false],
];

// Tracked channels for the Channels tab. avatar_url stays null on purpose — the capture runs
// offline, so a remote avatar URL would render as a broken image rather than the fallback.
// [title, handle, follower_count, video_count, new_count]
const CHANNELS = [
  ["Martin Kleppmann", "@kleppmann", 48200, 62, 3],
  ["No Boilerplate", "@NoBoilerplate", 312000, 148, 0],
  ["Tsoding Daily", "@TsodingDaily", 121000, 934, 12],
  ["Kevin Powell", "@KevinPowell", 905000, 786, 1],
  ["GOTO Conferences", "@GOTO-", 402000, 2410, 0],
  ["Ink & Switch", "@inkandswitch", 8400, 41, 2],
  ["The Changelog", "@Changelog", 27600, 615, 5],
  ["Matt Pocock", "@mattpocockuk", 188000, 512, 0],
];

// Queue rows covering every state the page can render: finished, mid-flight, waiting,
// canceled, and a failure carrying a per-op message.
// [url, status, ops, error, spec]
const QUEUE = [
  ["https://www.youtube.com/watch?v=q7Kd9x1Ab2", "done", { download: "done", transcript: "done", summarize: "done" }, null, { transcript: true, summarize: true }],
  ["https://www.youtube.com/watch?v=Lm4Tt0Pz9c", "done", { download: "done", transcript: "done", summarize: "skipped" }, null, { transcript: true, summarize: false }],
  ["https://vimeo.com/849201773", "running", { download: "running", transcript: "pending", summarize: "pending" }, null, { transcript: true, summarize: false }],
  ["https://www.youtube.com/watch?v=Zr8Nn2Qw5v", "queued", null, null, { transcript: true, summarize: true }],
  ["https://www.twitch.tv/videos/2043118876", "queued", null, null, { transcript: false, summarize: false }],
  ["https://soundcloud.com/changelog/ytdlp-maintainers", "queued", null, null, { transcript: true, summarize: false }],
  [
    "https://www.youtube.com/watch?v=Bk3Vv7Yh1n",
    "done",
    { download: "done", transcript: "error", summarize: "skipped", messages: { transcript: "No captions available for this video." } },
    "No captions available for this video.",
    { transcript: true, summarize: false },
  ],
  ["https://www.youtube.com/watch?v=Cx9Mm4Rd6t", "canceled", null, null, { transcript: true, summarize: false }],
];

const db = new Database(dbPath);
db.pragma("busy_timeout = 5000");
try {
  const insertMedia = db.prepare(
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
  const insertTranscript = db.prepare(
    `INSERT INTO transcript (media_id, provider_id, language, text, segments_json, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertSummary = db.prepare(
    `INSERT INTO summary (media_id, prompt_id, provider_id, model, text, created_at)
     VALUES (?, NULL, ?, ?, ?, ?)`,
  );
  const insertTag = db.prepare(`INSERT OR IGNORE INTO media_tag (media_id, name) VALUES (?, ?)`);

  // Fixed base date so shots are deterministic run to run (no Date.now()).
  const base = Date.UTC(2026, 6, 1);
  const day = 86_400_000;

  const tx = db.transaction(() => {
    ROWS.forEach((row, i) => {
      const [title, uploader, platform, duration, lang, tags, hasTranscript, hasSummary] = row;
      const created = base + i * day;
      const info = insertMedia.run({
        source_url: `https://example.com/${platform}/${i}`,
        platform_id: platform,
        external_id: `shots-${i}`,
        title,
        uploader,
        uploader_url: `https://example.com/@${uploader.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        duration_s: duration,
        thumbnail_path: null,
        view_count: 1200 + i * 977,
        like_count: 40 + i * 31,
        published_at: created - 30 * day,
        metadata_json: "{}",
        channel_id: null,
        download_path: i % 3 === 0 ? `C:\\Users\\demo\\Downloads\\Sift\\${i}.mp4` : null,
        download_status: i % 3 === 0 ? "done" : "none",
        created_at: created,
        updated_at: created,
      });
      const mediaId = info.lastInsertRowid;

      if (hasTranscript) {
        insertTranscript.run(
          mediaId,
          "youtube-captions",
          lang,
          `Transcript for ${title}. `.repeat(12),
          JSON.stringify([
            { start: 0, end: 6, text: "Welcome — let's get straight into it." },
            { start: 6, end: 14, text: "The first thing worth understanding is the data model." },
            { start: 14, end: 23, text: "Once that clicks, everything downstream is much simpler." },
          ]),
          null,
          created,
        );
      }
      if (hasSummary) {
        insertSummary.run(
          mediaId,
          "anthropic",
          "claude-sonnet-5",
          `Key points from ${title}:\n\n- The core idea and why it matters.\n- Two tradeoffs worth remembering.\n- What to try next.`,
          created,
        );
      }
      tags.forEach((t) => insertTag.run(mediaId, t));
    });
  });
  tx();

  const insertChannel = db.prepare(
    `INSERT OR IGNORE INTO channel (
       channel_id, url, handle, title, description, uploader, avatar_url, banner_url,
       follower_count, video_count, last_seen_video_id, new_count, last_checked, created_at
     ) VALUES (
       @channel_id, @url, @handle, @title, @description, @uploader, NULL, NULL,
       @follower_count, @video_count, NULL, @new_count, @last_checked, @created_at
     )`,
  );
  const insertQueue = db.prepare(
    `INSERT INTO queue_item (source_url, spec_json, status, ops_json, media_id, queue_order, error, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
  );

  const extras = db.transaction(() => {
    CHANNELS.forEach((row, i) => {
      const [title, handle, followers, videos, newCount] = row;
      insertChannel.run({
        channel_id: `UCshots${String(i).padStart(4, "0")}`,
        url: `https://www.youtube.com/${handle}`,
        handle,
        title,
        description: `${title} publishes talks and deep dives. Tracked for new uploads.`,
        uploader: title,
        follower_count: followers,
        video_count: videos,
        new_count: newCount,
        last_checked: base + 27 * day - i * 3600_000,
        created_at: base + i * day,
      });
    });

    QUEUE.forEach((row, i) => {
      const [url, status, ops, error, opts] = row;
      insertQueue.run(
        url,
        JSON.stringify({
          format: { kind: "video", maxHeight: 1080, mp4: true },
          download: true,
          transcript: opts.transcript,
          summarize: opts.summarize
            ? { providerId: "anthropic", model: "claude-sonnet-5", promptId: 1 }
            : null,
          tags: i % 2 === 0 ? ["research"] : [],
        }),
        status,
        ops ? JSON.stringify(ops) : null,
        i + 1,
        error,
        base + 27 * day + i * 60_000,
      );
    });
  });
  extras();
} finally {
  db.close();
}
