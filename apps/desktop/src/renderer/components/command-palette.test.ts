import { describe, expect, it } from "vitest";
import { filterCommands, matches, type Command } from "./command-palette";

const cmd = (id: string, label: string, keywords = ""): Command => ({
  id,
  label,
  keywords,
  run: () => {},
});

const COMMANDS = [
  cmd("go-home", "Go to Home", "url paste fetch"),
  cmd("go-library", "Go to Library", "media files saved"),
  cmd("go-settings", "Go to Settings", "preferences options config"),
  cmd("import-file", "Import a local file…", "open add drop"),
];

describe("matches", () => {
  it("matches a subsequence, so dropped letters still hit", () => {
    expect(matches("lib", "Go to Library")).toBe(true);
    expect(matches("lbry", "Go to Library")).toBe(true);
    expect(matches("gts", "Go to Settings")).toBe(true);
  });

  it("ignores case and spaces in the query", () => {
    expect(matches("GO SET", "Go to Settings")).toBe(true);
  });

  it("rejects letters that are not there, in order", () => {
    expect(matches("zzz", "Go to Library")).toBe(false);
    expect(matches("yrarbil", "Go to Library")).toBe(false);
  });

  it("treats an empty query as a match", () => {
    expect(matches("", "anything")).toBe(true);
  });
});

describe("filterCommands", () => {
  it("returns everything for a blank query", () => {
    expect(filterCommands(COMMANDS, "  ")).toHaveLength(4);
  });

  it("matches on keywords the label does not contain", () => {
    expect(filterCommands(COMMANDS, "prefs").map((c) => c.id)).toEqual([
      "go-settings",
    ]);
  });

  it("narrows to one command", () => {
    expect(filterCommands(COMMANDS, "import").map((c) => c.id)).toEqual([
      "import-file",
    ]);
  });
});
