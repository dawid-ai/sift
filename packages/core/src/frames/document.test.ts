import { describe, expect, it } from "vitest";
import { renderHtmlDocument, renderMarkdownDocument, type DocFrame, type DocSegment } from "./document";

const segments: DocSegment[] = [
  { start: 0, text: "Intro sentence one." },
  { start: 2, text: "Intro sentence two." },
  { start: 10, text: "After the slide." },
];
const frames: DocFrame[] = [{ tsMs: 5000, src: "file:///slide.jpg" }];

describe("renderMarkdownDocument", () => {
  it("coalesces adjacent segments and drops the slide at its timestamp", () => {
    const md = renderMarkdownDocument("My Talk", segments, frames);
    // Two intro segments merged into one paragraph, then the image, then the trailing text.
    expect(md).toContain("Intro sentence one. Intro sentence two.");
    const slideIdx = md.indexOf("![slide 00:05](file:///slide.jpg)");
    expect(slideIdx).toBeGreaterThan(md.indexOf("Intro sentence two."));
    expect(md.indexOf("After the slide.")).toBeGreaterThan(slideIdx);
    expect(md).toContain("# My Talk");
  });

  it("appends frames after the text when there are no segment anchors", () => {
    const md = renderMarkdownDocument("T", [{ start: 0, text: "whole transcript" }], [{ tsMs: 9000, src: "x.jpg" }]);
    expect(md.indexOf("whole transcript")).toBeLessThan(md.indexOf("![slide"));
  });
});

describe("renderHtmlDocument", () => {
  it("escapes text and embeds the image src", () => {
    const html = renderHtmlDocument("A & B", [{ start: 0, text: "1 < 2" }], frames);
    expect(html).toContain("<h1>A &amp; B</h1>");
    expect(html).toContain("<p>1 &lt; 2</p>");
    expect(html).toContain('<img src="file:///slide.jpg"');
  });
});
