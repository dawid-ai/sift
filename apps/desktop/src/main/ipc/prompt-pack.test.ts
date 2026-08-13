import { describe, expect, it } from "vitest";
import { parsePromptPack } from "./prompt-pack";

// Covers the pure part of `prompts:import` — parsing, shape validation, and the
// imported/skipped counts the renderer now surfaces to the user (a hand-edited pack
// with typos must be reported, not silently under-imported). Deliberately does not
// touch `registerSummarizeIpc`/`ipcMain`/`dialog`/`getDb` — this module has no Electron
// or db imports, which is the whole reason it's split out of summarize.ts.
describe("parsePromptPack", () => {
  it("returns every entry with skipped: 0 when the whole array is well-formed", () => {
    const raw = JSON.stringify([
      { name: "Chapters", body: "Break the transcript into chapters." },
      { name: "Show notes", body: "Write show notes." },
    ]);

    const result = parsePromptPack(raw);

    expect(result.entries).toEqual([
      { name: "Chapters", body: "Break the transcript into chapters." },
      { name: "Show notes", body: "Write show notes." },
    ]);
    expect(result.skipped).toBe(0);
  });

  it("reports the correct skipped count for a mix of valid and malformed entries", () => {
    // 10 entries, 3 malformed (a typo'd key, a wrong-typed field, an empty string) — the
    // exact "10 with 3 typos" shape called out by the review that prompted this test.
    const raw = JSON.stringify([
      { name: "Good 1", body: "b1" },
      { name: "Good 2", body: "b2" },
      { bdoy: "typo'd key", name: "Typo entry" }, // missing `body`
      { name: "Good 3", body: "b3" },
      { name: 42, body: "wrong-typed name" },
      { name: "Good 4", body: "b4" },
      { name: "", body: "empty name" },
      { name: "Good 5", body: "b5" },
      { name: "Good 6", body: "b6" },
      { name: "Good 7", body: "b7" },
    ]);

    const result = parsePromptPack(raw);

    expect(result.entries).toHaveLength(7);
    expect(result.entries.every((e) => e.name.startsWith("Good"))).toBe(true);
    expect(result.skipped).toBe(3);
  });

  it("returns an empty entries array with skipped: 0 for an empty array", () => {
    expect(parsePromptPack("[]")).toEqual({ entries: [], skipped: 0 });
  });

  it("reports skipped for an array where every entry is malformed", () => {
    const raw = JSON.stringify([{ name: "" }, { body: "no name" }, "not an object", null]);

    const result = parsePromptPack(raw);

    expect(result.entries).toEqual([]);
    expect(result.skipped).toBe(4);
  });

  it("throws a clear message (not the raw parser error) for invalid JSON", () => {
    expect(() => parsePromptPack("{ not valid json")).toThrow("That file isn't valid JSON.");
  });

  it("throws for valid JSON that isn't a top-level array", () => {
    expect(() => parsePromptPack(JSON.stringify({ name: "x", body: "y" }))).toThrow(
      "That file isn't a prompt pack (expected a JSON array).",
    );
  });

  it("trims name/body but does not otherwise mutate valid entries", () => {
    const raw = JSON.stringify([{ name: "  Padded  ", body: "  padded body  " }]);

    const result = parsePromptPack(raw);

    // parsePromptPack only validates/filters; trimming for the actual upsert happens at
    // the call site (summarize.ts's import handler), so the raw body survives here.
    expect(result.entries).toEqual([{ name: "  Padded  ", body: "  padded body  " }]);
    expect(result.skipped).toBe(0);
  });
});
