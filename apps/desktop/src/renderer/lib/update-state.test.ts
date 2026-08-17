import { describe, expect, it } from "vitest";
import { initialUpdateState, updateReducer } from "./update-state";

describe("updateReducer", () => {
  it("starts idle", () => {
    expect(initialUpdateState).toEqual({ kind: "idle" });
  });

  it("checking → available → downloading advances percent → downloaded", () => {
    let s = updateReducer(initialUpdateState, { type: "checking" });
    expect(s).toEqual({ kind: "checking" });
    s = updateReducer(s, {
      type: "available",
      version: "1.2.3",
      releaseNotes: "notes",
    });
    expect(s).toEqual({
      kind: "available",
      version: "1.2.3",
      releaseNotes: "notes",
    });
    s = updateReducer(s, { type: "downloading", percent: 10 });
    expect(s).toEqual({ kind: "downloading", percent: 10 });
    s = updateReducer(s, { type: "downloading", percent: 55 });
    expect(s).toEqual({ kind: "downloading", percent: 55 });
    s = updateReducer(s, { type: "downloaded", version: "1.2.3" });
    expect(s).toEqual({ kind: "downloaded", version: "1.2.3" });
  });

  it("ignores late download-progress once downloaded", () => {
    const downloaded = { kind: "downloaded", version: "1.2.3" } as const;
    expect(
      updateReducer(downloaded, { type: "downloading", percent: 99 }),
    ).toEqual(downloaded);
  });

  it("dismiss returns to idle from any state", () => {
    const avail = {
      kind: "available",
      version: "1",
      releaseNotes: "",
    } as const;
    expect(updateReducer(avail, { type: "dismiss" })).toEqual({ kind: "idle" });
  });

  it("maps not-available and error", () => {
    expect(
      updateReducer(initialUpdateState, { type: "not-available" }),
    ).toEqual({ kind: "not-available" });
    expect(
      updateReducer(initialUpdateState, { type: "error", message: "boom" }),
    ).toEqual({
      kind: "error",
      message: "boom",
    });
  });
});
