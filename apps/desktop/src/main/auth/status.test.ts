import { describe, expect, it } from "vitest";
import { isAuthError, isMembersOnlyError, registrableDomain } from "./status";

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

describe("isMembersOnlyError", () => {
  // Verbatim from a queue row: yt-dlp's actual refusal for a membership-walled video.
  const REAL =
    "yt-dlp failed while dumping JSON for https://www.youtube.com/watch?v=o0Pcha6UjRM: " +
    "ERROR: [youtube] o0Pcha6UjRM: Join this channel to get access to members-only content " +
    "like this video, and other exclusive perks.";

  it("matches a membership wall", () => {
    expect(isMembersOnlyError(REAL)).toBe(true);
  });

  it("does NOT report it as an expired session", () => {
    // The whole point: this string contains "members-only", which is in AUTH_ERROR_PATTERNS.
    // Before the split it was reported as a bad session and told you to sign in again, which
    // fixes nothing — a perfectly valid session that isn't a member gets the same refusal.
    expect(isAuthError(REAL)).toBe(false);
  });

  it("leaves a genuine bot-check alone", () => {
    const bot = "ERROR: Sign in to confirm you’re not a bot";
    expect(isMembersOnlyError(bot)).toBe(false);
    expect(isAuthError(bot)).toBe(true);
  });

  it("is not tripped by an ordinary network failure", () => {
    expect(
      isMembersOnlyError("ERROR: unable to download webpage: timed out"),
    ).toBe(false);
  });
});
