import { beforeEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import {
  runMigrations,
  insertMedia,
  insertTranscript,
  insertSummary,
} from "./index";
import type {
  SiftDatabase,
  NewMedia,
  NewTranscript,
  NewSummary,
} from "./index";
import { searchMedia, toMatchExpr } from "./search";

// Searching inside transcripts and summaries is opt-in; these tests are about
// exactly that text, so they turn it on.
const TEXT = { includeText: true } as const;

function addMedia(db: SiftDatabase, overrides: Partial<NewMedia> = {}): number {
  const m: NewMedia = {
    source_url: "https://y/1",
    platform_id: "youtube",
    external_id: "abc",
    title: "Vid",
    uploader: "Chan",
    uploader_url: null,
    duration_s: 100,
    thumbnail_path: null,
    view_count: null,
    like_count: null,
    published_at: null,
    metadata_json: null,
    download_status: "none",
    ...overrides,
  };
  return insertMedia(db, m).id;
}

function transcript(
  mediaId: number,
  overrides: Partial<NewTranscript> = {},
): NewTranscript {
  return {
    media_id: mediaId,
    provider_id: "ytdlp-subs",
    language: "en",
    text: "hello world",
    segments_json: "[]",
    model: null,
    ...overrides,
  };
}

function summary(
  mediaId: number,
  overrides: Partial<NewSummary> = {},
): NewSummary {
  return {
    media_id: mediaId,
    prompt_id: null,
    provider_id: "anthropic",
    model: "claude-sonnet",
    text: "summary text",
    ...overrides,
  };
}

describe("searchMedia", () => {
  let db: SiftDatabase;
  beforeEach(async () => {
    db = await openTestDatabase();
    runMigrations(db);
  });

  it("returns [] for empty/whitespace query", () => {
    expect(searchMedia(db, "")).toEqual([]);
    expect(searchMedia(db, "   ")).toEqual([]);
  });

  it("matches title (case-insensitive), snippet null", () => {
    const id = addMedia(db, { title: "The Quick Brown Fox" });
    const hits = searchMedia(db, "quick");
    expect(hits).toEqual([{ mediaId: id, field: "title", snippet: null }]);
  });

  it("matches uploader, snippet null", () => {
    const id = addMedia(db, { title: "x", uploader: "Veritasium" });
    expect(searchMedia(db, "verita")[0]).toMatchObject({
      mediaId: id,
      field: "uploader",
      snippet: null,
    });
  });

  it("matches transcript text with a bounded snippet containing the term", () => {
    const id = addMedia(db, { title: "x" });
    insertTranscript(
      db,
      transcript(id, {
        text: "In this video we discuss the process of photosynthesis in great detail throughout.",
      }),
    );
    const hit = searchMedia(db, "photosynthesis", TEXT)[0]!;
    expect(hit).toMatchObject({ mediaId: id, field: "transcript" });
    expect(hit.snippet).toContain("photosynthesis");
    expect(hit.snippet!.length).toBeLessThanOrEqual(84); // ~80 + ellipses
  });

  it("matches summary text when title/uploader/transcript do not", () => {
    const id = addMedia(db, { title: "x", uploader: "y" });
    insertSummary(
      db,
      summary(id, {
        text: "The cell contains a mitochondria which produces energy.",
      }),
    );
    expect(searchMedia(db, "mitochondria", TEXT)[0]).toMatchObject({
      mediaId: id,
      field: "summary",
    });
  });

  it("prefers title over transcript when both match", () => {
    const id = addMedia(db, { title: "photosynthesis basics" });
    insertTranscript(
      db,
      transcript(id, { text: "today we cover photosynthesis in depth" }),
    );
    expect(searchMedia(db, "photosynthesis", TEXT)[0]).toMatchObject({
      field: "title",
      snippet: null,
    });
  });

  it("returns nothing when no field matches", () => {
    addMedia(db, { title: "unrelated" });
    expect(searchMedia(db, "zzz")).toEqual([]);
  });

  // FTS5's MATCH takes a query language, not a string, so unescaped input does not
  // merely return nothing -- it throws. Every one of these is a real thing someone
  // types into a search box.
  describe("hostile input is not a syntax error", () => {
    const NASTY = [
      "p99:",
      "C++",
      "queue AND",
      "AND",
      "OR NOT",
      "*",
      "^foo",
      '"unbalanced',
      "a(b)c",
      "NEAR(x y)",
      "-",
      "{}",
      "  ",
      "",
    ];
    for (const q of NASTY) {
      it(`survives ${JSON.stringify(q)}`, () => {
        addMedia(db, { title: "Backpressure" });
        expect(() => searchMedia(db, q)).not.toThrow();
      });
    }

    it("returns no hits for input with nothing searchable in it", () => {
      addMedia(db, { title: "Backpressure" });
      expect(toMatchExpr("  ")).toBeNull();
      expect(toMatchExpr("*** ---")).toBeNull();
      expect(searchMedia(db, "*** ---")).toEqual([]);
    });

    it("treats a doubled quote as literal rather than closing the phrase", () => {
      expect(toMatchExpr('say "hi"', true)).toBe('"say"* AND """hi"""*');
      expect(toMatchExpr('say "hi"')).toBe(
        '{title uploader} : ("say"* AND """hi"""*)',
      );
    });
  });

  // The payoff for the index: a prefix anchors to the start of a token, so the
  // substring scan's interior false positives are gone.
  describe("word boundaries", () => {
    it("no longer matches inside a longer word", () => {
      addMedia(db, { title: "Everything I got wrong about caching" });
      insertTranscript(
        db,
        transcript(1, {
          text: "we concatenate the cache key from three fields",
        }),
      );
      expect(searchMedia(db, "cat", TEXT)).toEqual([]);
    });

    it("still matches a word the user has only partly typed", () => {
      const id = addMedia(db, { title: "x", uploader: "Veritasium" });
      expect(searchMedia(db, "verita")[0]).toMatchObject({ mediaId: id });
    });
  });

  // The switch. Off by default: most lookups are for a video the user can
  // half-name, and against the full spoken text those drown in videos that merely
  // said the word once in passing.
  describe("includeText switch", () => {
    const seed = () => {
      const id = addMedia(db, { title: "Cooking pasta", uploader: "Kitchen" });
      insertTranscript(
        db,
        transcript(id, { text: "today we discuss backpressure at length" }),
      );
      insertSummary(
        db,
        summary(id, { text: "a summary mentioning mitochondria" }),
      );
      return id;
    };

    it("ignores transcript and summary text by default", () => {
      seed();
      expect(searchMedia(db, "backpressure")).toEqual([]);
      expect(searchMedia(db, "mitochondria")).toEqual([]);
    });

    it("finds transcript and summary text when switched on", () => {
      const id = seed();
      expect(searchMedia(db, "backpressure", TEXT)[0]).toMatchObject({
        mediaId: id,
        field: "transcript",
      });
      expect(searchMedia(db, "mitochondria", TEXT)[0]).toMatchObject({
        mediaId: id,
        field: "summary",
      });
    });

    it("matches title and uploader in both modes", () => {
      const id = seed();
      for (const opts of [undefined, TEXT]) {
        expect(searchMedia(db, "pasta", opts)[0]).toMatchObject({
          mediaId: id,
        });
        expect(searchMedia(db, "kitchen", opts)[0]).toMatchObject({
          mediaId: id,
        });
      }
    });

    it("scopes the match expression to title and uploader when off", () => {
      expect(toMatchExpr("queue")).toBe('{title uploader} : ("queue"*)');
      expect(toMatchExpr("queue", true)).toBe('"queue"*');
    });
  });

  // This search runs on every keystroke of a debounced box, so its cost is a
  // correctness property, not a nice-to-have.
  //
  // The first FTS5 cut used the obvious tool -- FTS5's own snippet() -- across
  // four columns. snippet() re-tokenizes the whole column to find matches, at
  // roughly 5ms PER ROW, so a 300-video library took 619ms per keystroke and a
  // 1000-video one took 2.5s. Matching and ranking were never the problem: they
  // are 10ms at 1000 videos. The excerpt is cut with instr/substr instead.
  //
  // The budget below is deliberately loose (this runs on the WASM driver, which
  // is slower than the native one the app ships, and on shared CI). It is not
  // measuring speed, it is catching a return to per-row tokenization, which is
  // an order of magnitude away from this line, not a few percent.
  it("stays fast enough to run on every keystroke", () => {
    const WORDS = 3000;
    const body = Array.from(
      { length: WORDS },
      (_, i) => ["queue", "latency", "cache", "buffer", "thread"][i % 5],
    ).join(" ");
    for (let i = 0; i < 120; i++) {
      const id = addMedia(db, {
        title: `Talk ${i}`,
        uploader: `Chan ${i % 7}`,
      });
      insertTranscript(db, transcript(id, { text: body }));
    }

    const started = Date.now();
    for (const q of ["q", "qu", "que", "queu", "queue"]) searchMedia(db, q);
    const perKeystroke = (Date.now() - started) / 5;

    expect(searchMedia(db, "queue", TEXT)).toHaveLength(120);
    expect(perKeystroke).toBeLessThan(150);
  });

  // The headline reason for the index. Ordering used to be created_at DESC, which
  // buries the video a phrase is actually about under whatever was added last.
  describe("ranking", () => {
    it("puts the densest match first, regardless of insert order", () => {
      const passing = addMedia(db, { title: "Caching" });
      insertTranscript(
        db,
        transcript(passing, {
          text: "mostly about caches, though a queue is mentioned once in passing near the end of the talk",
        }),
      );
      // Added LAST, so recency ordering would have put it first anyway; make it
      // the weaker match so the assertion can only pass on relevance.
      const about = addMedia(db, { title: "Queues everywhere" });
      insertTranscript(
        db,
        transcript(about, {
          text: "queue queue queue, the whole talk is queue",
        }),
      );

      expect(searchMedia(db, "queue", TEXT).map((h) => h.mediaId)).toEqual([
        about,
        passing,
      ]);
    });
  });

  // The index is fed by triggers rather than by the write paths, so it has to
  // survive edits and deletes to the rows it mirrors.
  describe("index stays in step with its source rows", () => {
    it("picks up a transcript inserted after the media row", () => {
      const id = addMedia(db, { title: "x" });
      expect(searchMedia(db, "photosynthesis", TEXT)).toEqual([]);
      insertTranscript(
        db,
        transcript(id, { text: "all about photosynthesis" }),
      );
      expect(searchMedia(db, "photosynthesis", TEXT)[0]).toMatchObject({
        mediaId: id,
        field: "transcript",
      });
    });

    it("drops a media row from the index when it is deleted", () => {
      const id = addMedia(db, { title: "ephemeral" });
      expect(searchMedia(db, "ephemeral")).toHaveLength(1);
      db.prepare("DELETE FROM media WHERE id = ?").run(id);
      expect(searchMedia(db, "ephemeral")).toEqual([]);
    });

    it("follows a retitled media row", () => {
      const id = addMedia(db, { title: "before" });
      db.prepare("UPDATE media SET title = @t WHERE id = @id").run({
        t: "after",
        id,
      });
      expect(searchMedia(db, "before")).toEqual([]);
      expect(searchMedia(db, "after")).toHaveLength(1);
    });
  });

  // Whitespace is AND. Before this, the query was one contiguous substring, so a
  // half-remembered pair of words found nothing unless they happened to sit
  // adjacent and in order -- which is the opposite of how anyone searches their
  // own library.
  describe("multi-word queries", () => {
    const LINE =
      "gives you twenty times the queue depth. You did not get five percent slower.";

    it("matches terms that are far apart in the same field", () => {
      const id = addMedia(db, { title: "Backpressure" });
      insertTranscript(db, transcript(id, { text: LINE }));
      expect(searchMedia(db, "queue slower", TEXT)[0]).toMatchObject({
        mediaId: id,
        field: "transcript",
      });
    });

    it("ignores the order the terms were typed in", () => {
      const id = addMedia(db, { title: "Backpressure" });
      insertTranscript(db, transcript(id, { text: LINE }));
      expect(
        searchMedia(db, "depth queue", TEXT).map((h) => h.mediaId),
      ).toEqual([id]);
    });

    it("lets each term match a different field", () => {
      const id = addMedia(db, { title: "Backpressure", uploader: "Kleppmann" });
      insertTranscript(db, transcript(id, { text: LINE }));
      expect(searchMedia(db, "kleppmann backpressure", TEXT)[0]).toMatchObject({
        mediaId: id,
      });
    });

    it("requires every term, not just one", () => {
      const id = addMedia(db, { title: "Backpressure" });
      insertTranscript(db, transcript(id, { text: LINE }));
      expect(searchMedia(db, "queue mitochondria", TEXT)).toEqual([]);
    });

    it("collapses runs of whitespace rather than searching for empty terms", () => {
      const id = addMedia(db, { title: "Backpressure" });
      insertTranscript(db, transcript(id, { text: LINE }));
      expect(
        searchMedia(db, "  queue   slower  ", TEXT).map((h) => h.mediaId),
      ).toEqual([id]);
    });

    it("still treats a single term exactly as before", () => {
      const id = addMedia(db, { title: "Backpressure" });
      insertTranscript(db, transcript(id, { text: LINE }));
      const [hit] = searchMedia(db, "queue", TEXT);
      expect(hit).toMatchObject({ mediaId: id, field: "transcript" });
      expect(hit?.snippet).toContain("queue");
    });
  });
});
