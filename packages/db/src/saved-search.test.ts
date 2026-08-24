import { describe, it, expect, beforeEach } from "vitest";
import { openTestDatabase } from "./testing";
import type { SiftDatabase } from "./database";
import { runMigrations } from "./migrations";
import {
  deleteSavedSearch,
  getSavedSearchByName,
  listSavedSearches,
  parseSavedFilter,
  saveSearch,
} from "./saved-search";

let db: SiftDatabase;
beforeEach(async () => {
  db = await openTestDatabase();
  runMigrations(db);
});

describe("saveSearch", () => {
  it("round-trips a name, query, and filter", () => {
    saveSearch(db, {
      name: "Long talks",
      query: "keynote",
      filter: { durationMin: 1800, platform: "youtube" },
    });
    const row = getSavedSearchByName(db, "long talks");
    expect(row?.query).toBe("keynote");
    expect(row?.filter).toEqual({ durationMin: 1800, platform: "youtube" });
  });

  it("replaces by name instead of creating a second entry", () => {
    saveSearch(db, { name: "x", query: "a", filter: { durationMin: 10 } });
    saveSearch(db, { name: "x", query: "b", filter: { durationMin: 20 } });
    expect(listSavedSearches(db)).toHaveLength(1);
    expect(getSavedSearchByName(db, "x")?.query).toBe("b");
  });

  it("rejects a blank name", () => {
    expect(() => saveSearch(db, { name: "  ", query: "", filter: {} })).toThrow(
      /needs a name/,
    );
  });

  it("lists alphabetically and deletes by id", () => {
    saveSearch(db, { name: "beta", query: "", filter: {} });
    const alpha = saveSearch(db, { name: "alpha", query: "", filter: {} });
    expect(listSavedSearches(db).map((r) => r.name)).toEqual(["alpha", "beta"]);
    deleteSavedSearch(db, alpha.id);
    expect(listSavedSearches(db).map((r) => r.name)).toEqual(["beta"]);
  });
});

describe("parseSavedFilter", () => {
  it("keeps every field this build knows", () => {
    const full = {
      tags: ["a"],
      excludeTags: ["b"],
      channel: "c",
      platform: "youtube",
      from: 1,
      to: 2,
      publishedFrom: 3,
      publishedTo: 4,
      durationMin: 5,
      durationMax: 6,
      favourite: true,
      collectionId: 7,
      missing: "summary",
      downloadStatus: "error",
    };
    expect(parseSavedFilter(JSON.stringify(full))).toEqual(full);
  });

  it("drops ids — a week-old list of row ids means nothing", () => {
    expect(
      parseSavedFilter(JSON.stringify({ ids: [1, 2], platform: "x" })),
    ).toEqual({ platform: "x" });
  });

  it("drops fields of the wrong type instead of passing them to the query builder", () => {
    const parsed = parseSavedFilter(
      JSON.stringify({
        tags: "not-an-array",
        durationMin: "600",
        missing: "nonsense",
        favourite: "yes",
        platform: "youtube",
      }),
    );
    expect(parsed).toEqual({ platform: "youtube" });
  });

  it("survives junk and non-objects", () => {
    expect(parseSavedFilter("{not json")).toEqual({});
    expect(parseSavedFilter("[]")).toEqual({});
    expect(parseSavedFilter("null")).toEqual({});
    expect(parseSavedFilter("42")).toEqual({});
  });

  it("keeps the known half of a filter written by a newer build", () => {
    expect(
      parseSavedFilter(
        JSON.stringify({ platform: "youtube", somethingNew: { deep: 1 } }),
      ),
    ).toEqual({ platform: "youtube" });
  });
});
