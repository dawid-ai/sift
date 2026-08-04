import { describe, expect, it } from "vitest";
import { binaryUpdateReducer, initialBinaryUpdateState } from "./binary-update-state";

describe("binaryUpdateReducer", () => {
  it("installing → ready replaces the same kind's notice", () => {
    let s = binaryUpdateReducer(initialBinaryUpdateState, { type: "installing", kind: "ytdlp" });
    expect(s.ytdlp).toEqual({ type: "installing", kind: "ytdlp" });
    s = binaryUpdateReducer(s, { type: "ready", kind: "ytdlp", version: "2024.09.01", reason: "updated" });
    expect(s.ytdlp).toEqual({ type: "ready", kind: "ytdlp", version: "2024.09.01", reason: "updated" });
  });

  it("tracks kinds independently", () => {
    let s = binaryUpdateReducer(initialBinaryUpdateState, { type: "installing", kind: "ytdlp" });
    s = binaryUpdateReducer(s, { type: "available", kind: "deno", installedVersion: "1", latestVersion: "2" });
    expect(s.ytdlp?.type).toBe("installing");
    expect(s.deno?.type).toBe("available");
  });

  it("dismiss clears only that kind", () => {
    let s = binaryUpdateReducer(initialBinaryUpdateState, { type: "available", kind: "deno", installedVersion: "1", latestVersion: "2" });
    s = binaryUpdateReducer(s, { type: "dismiss", kind: "deno" });
    expect(s.deno).toBeUndefined();
  });
});
