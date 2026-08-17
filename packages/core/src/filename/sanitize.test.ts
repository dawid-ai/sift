import { describe, expect, it } from "vitest";
import { sanitizeFilename, buildOutputBaseName } from "./sanitize";

describe("sanitizeFilename", () => {
  it("replaces reserved and control chars with underscore", () => {
    expect(sanitizeFilename('a/b:c*d?e"f<g>h|i\\j')).toBe(
      "a_b_c_d_e_f_g_h_i_j",
    );
    expect(sanitizeFilename("tab\tnew\nline")).toBe("tab new line");
  });
  it("collapses whitespace, trims, strips trailing dots/spaces", () => {
    expect(sanitizeFilename("  hello   world  ")).toBe("hello world");
    expect(sanitizeFilename("name...")).toBe("name");
    expect(sanitizeFilename("trailing . ")).toBe("trailing");
  });
  it("preserves unicode letters", () => {
    expect(sanitizeFilename("Café Münster 日本")).toBe("Café Münster 日本");
  });
  it("caps length and falls back to 'untitled' when empty", () => {
    expect(sanitizeFilename("x".repeat(500)).length).toBe(200);
    expect(sanitizeFilename("///")).toBe("untitled");
    expect(sanitizeFilename("")).toBe("untitled");
    expect(sanitizeFilename("ab", { maxLength: 1 })).toBe("a");
  });
});

describe("buildOutputBaseName", () => {
  it("joins uploader and title with __; omits uploader when null", () => {
    expect(buildOutputBaseName("Rick Astley", "Never Gonna Give You Up")).toBe(
      "Rick Astley__Never Gonna Give You Up",
    );
    expect(buildOutputBaseName(null, "Solo Title")).toBe("Solo Title");
  });
});
