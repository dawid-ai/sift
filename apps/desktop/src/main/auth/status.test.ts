import { describe, expect, it } from "vitest";
import { isAuthError, registrableDomain } from "./status";

describe("isAuthError", () => {
  it("matches yt-dlp bot-check phrasing (case-insensitive)", () => {
    expect(isAuthError("ERROR: Sign in to confirm you’re not a bot")).toBe(
      true,
    );
    expect(isAuthError("Please use --cookies for the authentication")).toBe(
      true,
    );
  });
  it("matches the curly-apostrophe (U+2019) bot-check variant", () => {
    expect(isAuthError("ERROR: Confirm you’re not a bot")).toBe(true);
  });
  it("does not match a generic network error", () => {
    expect(isAuthError("ERROR: unable to download: HTTP Error 500")).toBe(
      false,
    );
  });
});

describe("registrableDomain", () => {
  it("reduces a host to its last two labels, lowercased, dot-stripped", () => {
    expect(registrableDomain("www.youtube.com")).toBe("youtube.com");
    expect(registrableDomain("accounts.google.com")).toBe("google.com");
    expect(registrableDomain(".youtube.com")).toBe("youtube.com");
    expect(registrableDomain("YouTube.com")).toBe("youtube.com");
  });
  it("passes through a single-label host", () => {
    expect(registrableDomain("localhost")).toBe("localhost");
  });
  it("returns empty for empty input", () => {
    expect(registrableDomain("")).toBe("");
  });
});
