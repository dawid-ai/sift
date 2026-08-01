import { describe, expect, it } from "vitest";
import { pageWindow } from "./page-window";

describe("pageWindow", () => {
  it("no ellipsis when every page fits", () => {
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });
  it("ellipsis after the first page near the start", () => {
    expect(pageWindow(1, 8)).toEqual([1, 2, "…", 8]);
  });
  it("ellipsis on both sides in the middle", () => {
    expect(pageWindow(5, 8)).toEqual([1, "…", 4, 5, 6, "…", 8]);
  });
  it("ellipsis before the last page near the end", () => {
    expect(pageWindow(8, 8)).toEqual([1, "…", 7, 8]);
  });
  it("single page and empty", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 0)).toEqual([]);
  });
});
