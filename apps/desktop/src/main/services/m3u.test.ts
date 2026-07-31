import { describe, it, expect } from "vitest";
import { buildM3U } from "./m3u";

describe("buildM3U", () => {
  it("empty → just the header", () => {
    expect(buildM3U([])).toBe("#EXTM3U\n");
  });
  it("formats EXTINF with duration and 'uploader — title'", () => {
    const out = buildM3U([{ title: "Title", uploader: "Chan", durationSec: 123.6, filePath: "C:/a.mp4" }]);
    expect(out).toBe("#EXTM3U\n#EXTINF:124,Chan — Title\nC:/a.mp4\n");
  });
  it("uses -1 when duration is null", () => {
    const out = buildM3U([{ title: "T", uploader: "U", durationSec: null, filePath: "C:/a.mp4" }]);
    expect(out).toContain("#EXTINF:-1,U — T");
  });
  it("falls back to title when uploader is null", () => {
    const out = buildM3U([{ title: "Solo", uploader: null, durationSec: 10, filePath: "C:/a.mp4" }]);
    expect(out).toContain("#EXTINF:10,Solo\n");
  });
  it("collapses newlines in the label so the #EXTINF line can't be split", () => {
    const out = buildM3U([{ title: "Line1\nLine2", uploader: "A\r\nB", durationSec: 5, filePath: "C:/a.mp4" }]);
    expect(out).toBe("#EXTM3U\n#EXTINF:5,A B — Line1 Line2\nC:/a.mp4\n");
    // Exactly 3 lines of content + trailing newline (header, one EXTINF, one path).
    expect(out.trimEnd().split("\n")).toHaveLength(3);
  });
  it("emits one EXTINF + path pair per entry", () => {
    const out = buildM3U([
      { title: "A", uploader: null, durationSec: 1, filePath: "C:/a.mp4" },
      { title: "B", uploader: null, durationSec: 2, filePath: "C:/b.mp4" },
    ]);
    expect(out).toBe("#EXTM3U\n#EXTINF:1,A\nC:/a.mp4\n#EXTINF:2,B\nC:/b.mp4\n");
  });
});
