import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { openTestDatabase } from "@sift/db/testing";
import {
  addTag,
  createPrompt,
  insertMedia,
  insertSummary,
  insertTranscript,
  runMigrations,
  type SiftDatabase,
} from "@sift/db";
import { ExportService } from "./export-service";

let db: SiftDatabase;
let dir: string;
let pdfCalls: string[];

function seed(opts: { withTranscript?: boolean; withSummary?: boolean } = {}) {
  const media = insertMedia(db, {
    source_url: "https://www.youtube.com/watch?v=abc",
    platform_id: "youtube",
    external_id: "abc",
    title: "A <Talk> & Notes",
    uploader: "Some Channel",
    uploader_url: null,
    duration_s: 3725,
    thumbnail_path: null,
    view_count: null,
    like_count: null,
    published_at: Date.parse("2026-03-04T00:00:00Z"),
    metadata_json: "{}",
    download_status: "done",
  });
  addTag(db, media.id, "deep work");
  if (opts.withTranscript)
    insertTranscript(db, {
      media_id: media.id,
      provider_id: "ytdlp-subs",
      language: "en",
      text: "First line\nSecond line",
      segments_json: JSON.stringify([
        { start: 0, end: 5, text: "First line" },
        { start: 5, end: 12, text: "Second line" },
      ]),
      model: null,
    });
  if (opts.withSummary) {
    const prompt = createPrompt(db, { name: "Key points", body: "b" });
    insertSummary(db, {
      media_id: media.id,
      prompt_id: prompt.id,
      provider_id: "anthropic",
      model: "claude-opus-5",
      text: "One point.",
    });
  }
  return media.id;
}

function service() {
  return new ExportService({
    db,
    outputDir: () => dir,
    renderPdf: async (html) => {
      pdfCalls.push(html);
      return Buffer.from("%PDF-1.4 fake");
    },
  });
}

beforeEach(async () => {
  db = await openTestDatabase();
  runMigrations(db);
  dir = mkdtempSync(join(tmpdir(), "sift-export-"));
  pdfCalls = [];
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("buildItem", () => {
  it("gathers metadata, tags, the transcript, and summaries", () => {
    const id = seed({ withTranscript: true, withSummary: true });
    const item = service().buildItem(id);
    expect(item.title).toBe("A <Talk> & Notes");
    expect(item.tags).toEqual(["deep work"]);
    expect(item.transcript?.segments).toHaveLength(2);
    expect(item.summaries[0]?.promptName).toBe("Key points");
  });

  it("survives a malformed segments blob by keeping the text", () => {
    const id = seed();
    insertTranscript(db, {
      media_id: id,
      provider_id: "whisper",
      language: null,
      text: "raw text",
      segments_json: "{not json",
      model: "small",
    });
    const item = service().buildItem(id);
    expect(item.transcript?.segments).toEqual([]);
    expect(item.transcript?.text).toBe("raw text");
    // A whisper run that detected no language must not print "null" in the export.
    expect(item.transcript?.language).toBe("unknown");
  });

  it("throws for an unknown media id", () => {
    expect(() => service().buildItem(999)).toThrow(/No media/);
  });
});

describe("export", () => {
  it("writes each single-file preset with the right extension", async () => {
    const id = seed({ withTranscript: true, withSummary: true });
    for (const [preset, ext] of [
      ["markdown", ".md"],
      ["html", ".html"],
      ["json", ".json"],
      ["csv", ".csv"],
    ] as const) {
      const result = await service().export(id, preset);
      expect(result.path.endsWith(ext)).toBe(true);
      expect(existsSync(result.path)).toBe(true);
    }
  });

  it("sanitises the title into a legal filename", async () => {
    const id = seed();
    const result = await service().export(id, "markdown");
    // < and > are not legal in a Windows filename; the sanitiser replaces them.
    expect(result.path).not.toContain("<");
    expect(result.path).not.toContain(">");
    expect(existsSync(result.path)).toBe(true);
  });

  it("renders PDF through the injected renderer and writes its bytes", async () => {
    const id = seed({ withTranscript: true });
    const result = await service().export(id, "pdf");
    expect(pdfCalls).toHaveLength(1);
    expect(pdfCalls[0]).toContain("<!doctype html>");
    expect(readFileSync(result.path).toString()).toContain("%PDF-1.4");
  });

  it("reuses the plain filename when the content is unchanged", async () => {
    const id = seed({ withTranscript: true });
    const first = await service().export(id, "markdown");
    const second = await service().export(id, "markdown");
    expect(second.path).toBe(first.path);
  });

  it("takes the next free name when the content differs", async () => {
    const id = seed({ withTranscript: true });
    const first = await service().export(id, "markdown");
    addTag(db, id, "changed");
    const second = await service().export(id, "markdown");
    expect(second.path).not.toBe(first.path);
    expect(second.path).toContain("(2)");
  });

  it("writes an Obsidian bundle as a folder, splitting the transcript out", async () => {
    const id = seed({ withTranscript: true, withSummary: true });
    const result = await service().export(id, "obsidian");
    expect(result.path).toContain("(Obsidian)");

    // The sanitiser replaces the illegal characters rather than dropping them, so the base
    // name is read back off the folder instead of being guessed here.
    const base = basename(result.path).replace(" (Obsidian)", "");
    const note = readFileSync(join(result.path, `${base}.md`), "utf8");
    expect(note.startsWith("---\n")).toBe(true);
    expect(note).toContain("[[Some Channel]]");
    // The note links the transcript rather than embedding it.
    expect(note).toContain("![[");
    expect(note).not.toContain("Second line");
    expect(
      readFileSync(join(result.path, `${base} transcript.md`), "utf8"),
    ).toContain("Second line");
    expect(readFileSync(join(result.path, "tags.md"), "utf8")).toContain(
      "#deep-work",
    );
  });

  it("writes an Obsidian bundle with no transcript file when there is no transcript", async () => {
    const id = seed({ withSummary: true });
    const result = await service().export(id, "obsidian");
    const base = basename(result.path).replace(" (Obsidian)", "");
    expect(existsSync(join(result.path, `${base} transcript.md`))).toBe(false);
    expect(existsSync(join(result.path, `${base}.md`))).toBe(true);
  });
});
