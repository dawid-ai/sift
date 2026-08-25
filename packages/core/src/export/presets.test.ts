import { describe, expect, it } from "vitest";
import {
  csvField,
  escapeHtml,
  hms,
  obsidianTag,
  renderCsv,
  renderHtml,
  renderJson,
  renderMarkdown,
  renderObsidianNote,
  renderPreset,
  type ExportItem,
} from "./presets";

const ITEM: ExportItem = {
  title: "Building <things> & stuff",
  sourceUrl: "https://www.youtube.com/watch?v=abc",
  uploader: "Some Channel",
  platformId: "youtube",
  durationS: 3725,
  publishedAt: Date.parse("2026-03-04T00:00:00Z"),
  tags: ["deep work", "notes"],
  transcript: {
    language: "en",
    segments: [
      { start: 0, end: 5, text: "First line" },
      { start: 5, end: 12, text: "Second line" },
    ],
    text: "First line\nSecond line",
  },
  summaries: [
    {
      promptName: "Key points",
      providerId: "anthropic",
      model: "claude-opus-5",
      text: "One point.\n\nAnother point.",
      createdAt: 0,
    },
  ],
};

describe("hms", () => {
  it("drops the hours field under an hour", () => {
    expect(hms(0)).toBe("0:00");
    expect(hms(65)).toBe("1:05");
    expect(hms(3725)).toBe("1:02:05");
  });
});

describe("renderMarkdown", () => {
  it("carries the title, metadata, summaries, and timed cues", () => {
    const md = renderMarkdown(ITEM);
    expect(md).toContain("# Building <things> & stuff");
    expect(md).toContain("**Channel:** Some Channel");
    expect(md).toContain("**Length:** 1:02:05");
    expect(md).toContain("**Published:** 2026-03-04");
    expect(md).toContain("**Tags:** deep work, notes");
    expect(md).toContain("## Summary — Key points");
    expect(md).toContain("**[0:00]** First line");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("falls back to raw text when the transcript has no segments", () => {
    const md = renderMarkdown({
      ...ITEM,
      transcript: { language: "en", segments: [], text: "flat text" },
    });
    expect(md).toContain("flat text");
    expect(md).not.toContain("**[");
  });

  it("omits sections it has nothing for", () => {
    const md = renderMarkdown({
      ...ITEM,
      transcript: null,
      summaries: [],
      tags: [],
      uploader: null,
    });
    expect(md).not.toContain("## Transcript");
    expect(md).not.toContain("## Summary");
    expect(md).not.toContain("**Tags:**");
    expect(md).not.toContain("**Channel:**");
  });
});

describe("renderHtml", () => {
  it("escapes every field that reaches markup", () => {
    const html = renderHtml(ITEM);
    expect(html).toContain("Building &lt;things&gt; &amp; stuff");
    expect(html).not.toContain("<things>");
  });

  it("does not let a hostile title or transcript inject a tag", () => {
    const html = renderHtml({
      ...ITEM,
      title: "</title><script>alert(1)</script>",
      transcript: {
        language: "en",
        segments: [{ start: 0, end: 1, text: "<img src=x onerror=alert(1)>" }],
        text: "",
      },
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("is a complete document", () => {
    const html = renderHtml(ITEM);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });
});

describe("renderJson", () => {
  it("round-trips through JSON.parse with the transcript intact", () => {
    const parsed = JSON.parse(renderJson(ITEM)) as Record<string, unknown>;
    expect(parsed.title).toBe(ITEM.title);
    expect(parsed.durationSeconds).toBe(3725);
    expect(
      (parsed.transcript as { segments: unknown[] }).segments,
    ).toHaveLength(2);
  });
});

describe("renderCsv", () => {
  it("tiles each row's end onto the next row's start", () => {
    const rows = renderCsv(ITEM).trim().split("\n");
    expect(rows[0]).toBe("start,end,startSeconds,endSeconds,text");
    expect(rows[1]).toContain('"0:00","0:05",0,5,"First line"');
    // The last row keeps its own end, since there is no next start.
    expect(rows[2]).toContain('"0:05","0:12",5,12,"Second line"');
  });

  it("quotes embedded quotes and neutralises a formula-leading cell", () => {
    expect(csvField('he said "no"')).toBe('"he said ""no"""');
    expect(csvField("=cmd|'/c calc'!A1")).toBe("\"\t=cmd|'/c calc'!A1\"");
    expect(csvField("-- and then")).toBe('"\t-- and then"');
    expect(csvField("plain")).toBe('"plain"');
  });

  it("is a header-only file when there is no timed transcript", () => {
    expect(renderCsv({ ...ITEM, transcript: null }).trim()).toBe(
      "start,end,startSeconds,endSeconds,text",
    );
  });
});

describe("renderObsidianNote", () => {
  it("writes frontmatter and links the channel", () => {
    const note = renderObsidianNote(ITEM);
    expect(note.startsWith("---\n")).toBe(true);
    expect(note).toContain('title: "Building <things> & stuff"');
    expect(note).toContain('tags: ["deep-work", "notes"]');
    expect(note).toContain("**Channel:** [[Some Channel]]");
  });

  it("hyphenates tags, because a space ends an Obsidian tag", () => {
    expect(obsidianTag("  deep  work ")).toBe("deep-work");
    expect(obsidianTag("notes")).toBe("notes");
  });
});

describe("renderPreset", () => {
  it("routes each preset, and renders pdf from the html body", () => {
    expect(renderPreset("markdown", ITEM)).toBe(renderMarkdown(ITEM));
    expect(renderPreset("json", ITEM)).toBe(renderJson(ITEM));
    expect(renderPreset("csv", ITEM)).toBe(renderCsv(ITEM));
    expect(renderPreset("obsidian", ITEM)).toBe(renderObsidianNote(ITEM));
    expect(renderPreset("pdf", ITEM)).toBe(renderHtml(ITEM));
  });
});

describe("escapeHtml", () => {
  it("covers all five characters", () => {
    expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
  });
});
