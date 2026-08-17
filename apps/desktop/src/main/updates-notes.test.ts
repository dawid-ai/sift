import { describe, expect, it } from "vitest";
import { notesToText, stripHtml } from "./updates-notes";

describe("stripHtml", () => {
  it("strips tags but keeps the text", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });
  it("turns <li> items into bullet lines", () => {
    expect(stripHtml("<ul><li>one</li><li>two</li></ul>")).toBe("• one\n• two");
  });
  it("decodes the common HTML entities", () => {
    expect(stripHtml("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;")).toBe(
      "a & b <c> \"d\" 'e'",
    );
  });
  it("collapses excess blank lines", () => {
    expect(stripHtml("<p>a</p><p></p><p></p><p>b</p>")).toBe("a\n\nb");
  });
});

describe("notesToText", () => {
  it("returns empty for null/undefined/empty", () => {
    expect(notesToText(null)).toBe("");
    expect(notesToText(undefined)).toBe("");
    expect(notesToText("")).toBe("");
  });
  it("strips a plain HTML string", () => {
    expect(notesToText("<p>hi there</p>")).toBe("hi there");
  });
  it("strips and joins an array of note infos", () => {
    expect(
      notesToText([
        { version: "1", note: "<p>a</p>" },
        { version: "2", note: "<p>b</p>" },
      ]),
    ).toBe("a\n\nb");
  });
});
