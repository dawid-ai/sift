import type { PromptPackEntry } from "@sift/ipc-contract";

// No `electron` / `@sift/db` imports — the parse and merge logic stays unit-testable, the
// same split `ipc/prompt-pack.ts` uses. Dialogs and db writes live in `ipc/profile.ts`.

export const PROFILE_KIND = "sift-profile";
export const PROFILE_VERSION = 1;

/**
 * A portable copy of everything that makes one install behave like another: the non-secret
 * settings and the user's own prompts.
 *
 * Deliberately excluded, and the exporter says so in the file: API keys (encrypted per
 * machine by `safeStorage`, so a copy would not decrypt anywhere else), sign-in cookies, the
 * media library, and the downloaded binaries.
 */
export interface SiftProfile {
  kind: typeof PROFILE_KIND;
  version: typeof PROFILE_VERSION;
  exportedAt: string;
  settings: Record<string, unknown>;
  prompts: PromptPackEntry[];
}

/**
 * One exportable setting. Every settings store in `main/settings/` already exposes exactly
 * `get`/`set`, so a slot is that pair plus a shape check — `check` only rejects the wrong
 * kind of value; each store's own `get()` re-validates on read and falls back to its default,
 * which is what guards anything subtler.
 */
export interface ProfileSlot {
  key: string;
  read(): unknown;
  check(value: unknown): boolean;
  write(value: unknown): void;
}

export interface ProfileImportResult {
  /** Setting keys that were applied. */
  applied: string[];
  /** Setting keys present in the file but rejected, or absent from this version. */
  skipped: string[];
  promptsCreated: number;
  promptsReplaced: number;
  /** Prompt entries dropped for a missing/empty name or body. */
  promptsSkipped: number;
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

/** Shape checks shared by the slot definitions and re-exported for tests. */
export const check = {
  string: isStr,
  boolean: isBool,
  stringArray: (v: unknown): boolean => Array.isArray(v) && v.every(isStr),
  oneOf:
    (...allowed: string[]) =>
    (v: unknown): boolean =>
      isStr(v) && allowed.includes(v),
  objectOrNull: (v: unknown): boolean =>
    v === null || (typeof v === "object" && !Array.isArray(v)),
  object: (v: unknown): boolean =>
    typeof v === "object" && v !== null && !Array.isArray(v),
};

export function buildProfile(
  slots: ProfileSlot[],
  prompts: PromptPackEntry[],
  now: string,
): SiftProfile {
  const settings: Record<string, unknown> = {};
  for (const slot of slots) {
    // A store that throws while reading shouldn't cost the user the rest of the export.
    try {
      settings[slot.key] = slot.read();
    } catch {
      /* omitted from the file, which reads as "not set" on import */
    }
  }
  return {
    kind: PROFILE_KIND,
    version: PROFILE_VERSION,
    exportedAt: now,
    settings,
    prompts,
  };
}

/**
 * Parses a profile file. Throws a user-facing message — never a raw parser error — for
 * anything that isn't a profile this version understands.
 */
export function parseProfile(raw: string): SiftProfile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error("That file isn't a profile.");
  const p = parsed as Partial<SiftProfile>;
  if (p.kind !== PROFILE_KIND)
    throw new Error(
      "That file isn't a profile. Prompt packs import under Settings → AI → Prompts.",
    );
  if (p.version !== PROFILE_VERSION)
    throw new Error(
      `That profile was written by a different version of the format (${String(p.version)}); this build reads version ${PROFILE_VERSION}.`,
    );
  return {
    kind: PROFILE_KIND,
    version: PROFILE_VERSION,
    exportedAt: isStr(p.exportedAt) ? p.exportedAt : "",
    settings: check.object(p.settings)
      ? (p.settings as Record<string, unknown>)
      : {},
    prompts: Array.isArray(p.prompts) ? (p.prompts as PromptPackEntry[]) : [],
  };
}

/**
 * Writes every setting the file carries that this build recognizes, and reports the rest.
 *
 * Partial application is deliberate: a profile from a newer build, or one hand-edited into a
 * bad value, should still restore everything it got right rather than fail whole. `skipped`
 * is what makes the difference visible to the user.
 */
export function applySettings(
  profile: SiftProfile,
  slots: ProfileSlot[],
): { applied: string[]; skipped: string[] } {
  const applied: string[] = [];
  const skipped: string[] = [];
  const known = new Set(slots.map((s) => s.key));
  for (const slot of slots) {
    if (!(slot.key in profile.settings)) continue;
    const value = profile.settings[slot.key];
    if (!slot.check(value)) {
      skipped.push(slot.key);
      continue;
    }
    try {
      slot.write(value);
      applied.push(slot.key);
    } catch {
      skipped.push(slot.key);
    }
  }
  for (const key of Object.keys(profile.settings))
    if (!known.has(key)) skipped.push(key);
  return { applied, skipped };
}

/** Drops entries that couldn't become a prompt; the count is reported, not hidden. */
export function validPromptEntries(entries: PromptPackEntry[]): {
  entries: PromptPackEntry[];
  skipped: number;
} {
  const good = entries.filter(
    (e): e is PromptPackEntry =>
      typeof e === "object" &&
      e !== null &&
      isStr(e.name) &&
      e.name.trim() !== "" &&
      isStr(e.body) &&
      e.body.trim() !== "",
  );
  return { entries: good, skipped: entries.length - good.length };
}
