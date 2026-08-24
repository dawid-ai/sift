import { describe, expect, it } from "vitest";
import {
  applySettings,
  buildProfile,
  check,
  parseProfile,
  PROFILE_KIND,
  PROFILE_VERSION,
  validPromptEntries,
  type ProfileSlot,
} from "./profile";

/** A slot backed by a plain variable, so the tests exercise the merge logic, not a store. */
function slot(
  key: string,
  initial: unknown,
  ok: (v: unknown) => boolean = () => true,
): ProfileSlot & { value: unknown } {
  const s = {
    key,
    value: initial,
    read: () => s.value,
    check: ok,
    write: (v: unknown) => {
      s.value = v;
    },
  };
  return s;
}

describe("buildProfile", () => {
  it("collects every slot under its key", () => {
    const p = buildProfile(
      [slot("lang", ["en"]), slot("auto", true)],
      [{ name: "n", body: "b" }],
      "2026-08-24T00:00:00.000Z",
    );
    expect(p.kind).toBe(PROFILE_KIND);
    expect(p.version).toBe(PROFILE_VERSION);
    expect(p.settings).toEqual({ lang: ["en"], auto: true });
    expect(p.prompts).toHaveLength(1);
  });

  it("omits a slot whose store throws rather than failing the export", () => {
    const bad: ProfileSlot = {
      key: "bad",
      read: () => {
        throw new Error("disk gone");
      },
      check: () => true,
      write: () => {},
    };
    const p = buildProfile([bad, slot("good", 1)], [], "now");
    expect(p.settings).toEqual({ good: 1 });
  });
});

describe("parseProfile", () => {
  const valid = JSON.stringify({
    kind: PROFILE_KIND,
    version: PROFILE_VERSION,
    exportedAt: "2026-08-24",
    settings: { a: 1 },
    prompts: [],
  });

  it("accepts a well-formed profile", () => {
    expect(parseProfile(valid).settings).toEqual({ a: 1 });
  });

  it("rejects non-JSON, non-objects, and other file kinds", () => {
    expect(() => parseProfile("{nope")).toThrow(/valid JSON/);
    expect(() => parseProfile("[]")).toThrow(/isn't a profile/);
    // A prompt pack is a bare array, so it lands here — the message points at the right place.
    expect(() => parseProfile('[{"name":"n","body":"b"}]')).toThrow(
      /isn't a profile/,
    );
  });

  it("rejects a different format version by number", () => {
    const other = JSON.stringify({ kind: PROFILE_KIND, version: 99 });
    expect(() => parseProfile(other)).toThrow(/99/);
  });

  it("tolerates missing settings and prompts", () => {
    const bare = JSON.stringify({
      kind: PROFILE_KIND,
      version: PROFILE_VERSION,
    });
    const p = parseProfile(bare);
    expect(p.settings).toEqual({});
    expect(p.prompts).toEqual([]);
  });
});

describe("applySettings", () => {
  it("writes recognized keys and reports the rest", () => {
    const lang = slot("lang", ["en"], check.stringArray);
    const auto = slot("auto", false, check.boolean);
    const profile = parseProfile(
      JSON.stringify({
        kind: PROFILE_KIND,
        version: PROFILE_VERSION,
        settings: { lang: ["pl", "en"], auto: true, futureThing: 1 },
        prompts: [],
      }),
    );
    const result = applySettings(profile, [lang, auto]);
    expect(lang.value).toEqual(["pl", "en"]);
    expect(auto.value).toBe(true);
    expect(result.applied).toEqual(["lang", "auto"]);
    // A key this build doesn't know is reported, not silently dropped.
    expect(result.skipped).toEqual(["futureThing"]);
  });

  it("skips a value of the wrong shape and leaves the store alone", () => {
    const lang = slot("lang", ["en"], check.stringArray);
    const profile = parseProfile(
      JSON.stringify({
        kind: PROFILE_KIND,
        version: PROFILE_VERSION,
        settings: { lang: "pl" },
      }),
    );
    const result = applySettings(profile, [lang]);
    expect(lang.value).toEqual(["en"]);
    expect(result).toEqual({ applied: [], skipped: ["lang"] });
  });

  it("skips a slot whose store rejects the write, and keeps applying the others", () => {
    const boom: ProfileSlot = {
      key: "boom",
      read: () => "x",
      check: () => true,
      write: () => {
        throw new Error("bad value");
      },
    };
    const auto = slot("auto", false, check.boolean);
    const profile = parseProfile(
      JSON.stringify({
        kind: PROFILE_KIND,
        version: PROFILE_VERSION,
        settings: { boom: "x", auto: true },
      }),
    );
    const result = applySettings(profile, [boom, auto]);
    expect(auto.value).toBe(true);
    expect(result.applied).toEqual(["auto"]);
    expect(result.skipped).toEqual(["boom"]);
  });

  it("leaves a setting absent from the file untouched", () => {
    const lang = slot("lang", ["en"], check.stringArray);
    const profile = parseProfile(
      JSON.stringify({ kind: PROFILE_KIND, version: PROFILE_VERSION }),
    );
    expect(applySettings(profile, [lang]).applied).toEqual([]);
    expect(lang.value).toEqual(["en"]);
  });
});

describe("check helpers", () => {
  it("oneOf accepts only the listed values", () => {
    const isMethod = check.oneOf("auto", "captions_only");
    expect(isMethod("auto")).toBe(true);
    expect(isMethod("prefer_whisper")).toBe(false);
    expect(isMethod(1)).toBe(false);
  });

  it("objectOrNull accepts null but not an array", () => {
    expect(check.objectOrNull(null)).toBe(true);
    expect(check.objectOrNull({ a: 1 })).toBe(true);
    expect(check.objectOrNull([])).toBe(false);
  });
});

describe("validPromptEntries", () => {
  it("drops malformed entries and counts them", () => {
    const { entries, skipped } = validPromptEntries([
      { name: "keep", body: "b" },
      { name: "", body: "b" },
      { name: "no body", body: "  " },
      null as never,
    ]);
    expect(entries).toEqual([{ name: "keep", body: "b" }]);
    expect(skipped).toBe(3);
  });
});
