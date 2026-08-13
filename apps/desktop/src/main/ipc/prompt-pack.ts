import type { PromptPackEntry } from "@sift/ipc-contract";

function isPromptPackEntry(e: unknown): e is PromptPackEntry {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as PromptPackEntry).name === "string" &&
    (e as PromptPackEntry).name.trim() !== "" &&
    typeof (e as PromptPackEntry).body === "string" &&
    (e as PromptPackEntry).body.trim() !== ""
  );
}

/**
 * Parses and validates a prompt-pack file's raw text — the pure part of `prompts:import`,
 * kept free of Electron/db imports (unlike `summarize.ts`, which pulls in `../index` and
 * its Electron app-lifecycle side effects) so it can be unit-tested directly. Throws a
 * user-facing message — never the raw parser/type error — for a file that isn't JSON or
 * isn't a top-level array. Entries that are missing/empty/wrong-typed `name` or `body`
 * are dropped rather than failing the whole import; `skipped` reports how many were
 * dropped so the caller can tell the user, instead of importing a subset with no visible
 * sign anything was skipped.
 */
export function parsePromptPack(raw: string): { entries: PromptPackEntry[]; skipped: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("That file isn't a prompt pack (expected a JSON array).");
  }
  const entries = parsed.filter(isPromptPackEntry);
  return { entries, skipped: parsed.length - entries.length };
}
