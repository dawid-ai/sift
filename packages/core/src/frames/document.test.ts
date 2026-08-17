import { describe, expect, it } from "vitest";
import {
  buildDocumentBlocks,
  fromMarkeredOutput,
  markdownToHtml,
  renderHtmlDocument,
  renderMarkdownBlocks,
  renderMarkdownDocument,
  toMarkeredTranscript,
  type Block,
  type DocFrame,
  type DocSegment,
} from "./document";

const segments: DocSegment[] = [
  { start: 0, text: "Intro sentence one." },
  { start: 2, text: "Intro sentence two." },
  { start: 10, text: "After the slide." },
];
const frames: DocFrame[] = [{ tsMs: 5000, src: "file:///slide.jpg" }];

describe("renderMarkdownDocument", () => {
  it("coalesces adjacent segments and drops the slide at its timestamp", () => {
    const md = renderMarkdownDocument("My Talk", segments, frames);
    expect(md).toContain("Intro sentence one. Intro sentence two.");
    const slideIdx = md.indexOf("![slide 00:05](file:///slide.jpg)");
    expect(slideIdx).toBeGreaterThan(md.indexOf("Intro sentence two."));
    expect(md.indexOf("After the slide.")).toBeGreaterThan(slideIdx);
    expect(md).toContain("# My Talk");
  });
});

describe("toMarkeredTranscript", () => {
  it("serialises blocks to numbered [[SLIDE n]] markers and returns slides in order", () => {
    const blocks = buildDocumentBlocks(segments, [
      { tsMs: 5000, src: "a" },
      { tsMs: 8000, src: "b" },
    ]);
    const { text, slides } = toMarkeredTranscript(blocks);
    expect(text).toContain("[[SLIDE 1]]");
    expect(text).toContain("[[SLIDE 2]]");
    expect(slides.map((s) => (s.kind === "frame" ? s.src : ""))).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("fromMarkeredOutput", () => {
  const slides: Block[] = [
    { kind: "frame", src: "a", tsMs: 1 },
    { kind: "frame", src: "b", tsMs: 2 },
  ];

  it("splices slide images back at their markers, ignoring surrounding whitespace", () => {
    const one: Block[] = [{ kind: "frame", src: "a", tsMs: 1 }];
    const out = fromMarkeredOutput(
      "## Topic\n\n[[SLIDE 1]]\n\nMore text.",
      one,
    );
    expect(out).toEqual([
      { kind: "text", text: "## Topic" },
      one[0],
      { kind: "text", text: "More text." },
    ]);
  });

  it("appends slides the model never referenced so no image is lost, and dedupes repeats", () => {
    const out = fromMarkeredOutput(
      "Only [[SLIDE 1]] and [[SLIDE 1]] again.",
      slides,
    );
    // slide 1 used once inline; slide 2 (unreferenced) appended at the end.
    expect(out.filter((b) => b.kind === "frame")).toEqual([
      slides[0],
      slides[1],
    ]);
  });
});

describe("markdownToHtml", () => {
  it("renders headers, bullets, paragraphs and inline emphasis", () => {
    const html = markdownToHtml(
      "## Findings\n\n- one **bold**\n- two\n\nA paragraph with `code`.",
    );
    expect(html).toContain("<h2>Findings</h2>");
    expect(html).toContain("<li>one <strong>bold</strong></li>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<p>A paragraph with <code>code</code>.</p>");
  });

  it("escapes HTML and treats plain text as a single paragraph", () => {
    expect(markdownToHtml("1 < 2 & 3")).toBe("<p>1 &lt; 2 &amp; 3</p>");
  });
});

describe("renderHtmlDocument", () => {
  it("escapes the title and embeds the image src", () => {
    const html = renderHtmlDocument(
      "A & B",
      [{ start: 0, text: "1 < 2" }],
      frames,
    );
    expect(html).toContain("<h1>A &amp; B</h1>");
    expect(html).toContain("<p>1 &lt; 2</p>");
    expect(html).toContain('<img src="file:///slide.jpg"');
  });
});

describe("renderMarkdownBlocks", () => {
  it("passes distilled Markdown text through untouched with images between", () => {
    const md = renderMarkdownBlocks("T", [
      { kind: "text", text: "## Section\n\n- a point" },
      { kind: "frame", src: "s.jpg", tsMs: 3000 },
    ]);
    expect(md).toContain("## Section");
    expect(md).toContain("- a point");
    expect(md).toContain("![slide 00:03](s.jpg)");
  });
});
