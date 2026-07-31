import { describe, it, expect } from "vitest";
import { filterLibrary } from "./library-filter";

// Minimal MediaListItem factory — only the fields filterLibrary reads.
function item(id: number, over: Partial<{ uploader: string; platformId: string; createdAt: number; tags: string[] }> = {}) {
  return {
    media: { id, uploader: over.uploader ?? "chan", platformId: over.platformId ?? "youtube", createdAt: over.createdAt ?? 1000 } as never,
    transcriptCount: 0, transcriptLanguage: null, formats: [], summaryCount: 0,
    tags: over.tags ?? [],
  } as never;
}
const NONE = { activeTag: null, channel: null, platform: null, from: null, to: null, searchIds: null };

describe("filterLibrary", () => {
  it("returns all when no filters", () => {
    const items = [item(1), item(2)];
    expect(filterLibrary(items, NONE)).toHaveLength(2);
  });
  it("filters by tag (case-insensitive)", () => {
    const items = [item(1, { tags: ["Music"] }), item(2, { tags: ["News"] })];
    expect(filterLibrary(items, { ...NONE, activeTag: "music" }).map((i) => i.media.id)).toEqual([1]);
  });
  it("filters by channel (exact uploader)", () => {
    const items = [item(1, { uploader: "A" }), item(2, { uploader: "B" })];
    expect(filterLibrary(items, { ...NONE, channel: "B" }).map((i) => i.media.id)).toEqual([2]);
  });
  it("filters by platform (exact platformId)", () => {
    const items = [item(1, { platformId: "youtube" }), item(2, { platformId: "twitter" })];
    expect(filterLibrary(items, { ...NONE, platform: "twitter" }).map((i) => i.media.id)).toEqual([2]);
  });
  it("filters by date range inclusive", () => {
    const items = [item(1, { createdAt: 100 }), item(2, { createdAt: 500 }), item(3, { createdAt: 900 })];
    expect(filterLibrary(items, { ...NONE, from: 200, to: 800 }).map((i) => i.media.id)).toEqual([2]);
  });
  it("intersects with searchIds when present", () => {
    const items = [item(1), item(2), item(3)];
    expect(filterLibrary(items, { ...NONE, searchIds: new Set([1, 3]) }).map((i) => i.media.id)).toEqual([1, 3]);
  });
  it("composes filters (AND)", () => {
    const items = [item(1, { uploader: "A", tags: ["x"], createdAt: 300 })];
    expect(filterLibrary(items, { activeTag: "x", channel: "A", platform: null, from: 200, to: 400, searchIds: new Set([1]) })).toHaveLength(1);
  });
});
