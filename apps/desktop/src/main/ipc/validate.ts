// Runtime guards for IPC payloads.
//
// SECURITY: the typed preload API (`SiftApi`) is a developer convenience, not a trust
// boundary. A compromised renderer can `invoke()` any channel with any value, so every
// handler that touches the filesystem, spawns a child process, or reaches the network
// re-checks its arguments here. A throw rejects the renderer's `invoke()`, which is the
// same error path handlers already use.

import { isAbsolute } from "node:path";

/** Rejects with a message that names the offending argument but never echoes its value. */
function fail(name: string, expected: string): never {
  throw new Error(`Invalid IPC argument "${name}": expected ${expected}.`);
}

/** A string, length-capped so a hostile renderer can't force an unbounded allocation. */
export function str(v: unknown, name: string, max = 8192): string {
  if (typeof v !== "string" || v.length > max)
    fail(name, `a string ≤ ${max} chars`);
  return v as string;
}

export function nonEmptyStr(v: unknown, name: string, max = 8192): string {
  const s = str(v, name, max);
  if (s.trim() === "") fail(name, "a non-empty string");
  return s;
}

/** A database row id: a positive safe integer. */
export function id(v: unknown, name: string): number {
  return int(v, name, 1, Number.MAX_SAFE_INTEGER);
}

export function int(
  v: unknown,
  name: string,
  min: number,
  max: number,
): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max)
    fail(name, `an integer in [${min}, ${max}]`);
  return v as number;
}

export function num(
  v: unknown,
  name: string,
  min: number,
  max: number,
): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    fail(name, `a finite number in [${min}, ${max}]`);
  return v as number;
}

export function bool(v: unknown, name: string): boolean {
  if (typeof v !== "boolean") fail(name, "a boolean");
  return v as boolean;
}

export function oneOf<T extends string>(
  v: unknown,
  name: string,
  allowed: readonly T[],
): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v))
    fail(name, `one of ${allowed.join(", ")}`);
  return v as T;
}

export function strArray(
  v: unknown,
  name: string,
  maxLen = 1000,
  maxItem = 8192,
): string[] {
  if (!Array.isArray(v) || v.length > maxLen)
    fail(name, `an array of ≤ ${maxLen} strings`);
  return (v as unknown[]).map((item, i) => str(item, `${name}[${i}]`, maxItem));
}

export function idArray(v: unknown, name: string, maxLen = 100_000): number[] {
  if (!Array.isArray(v) || v.length > maxLen)
    fail(name, `an array of ≤ ${maxLen} ids`);
  return (v as unknown[]).map((item, i) => id(item, `${name}[${i}]`));
}

/** An `http:`/`https:` URL. Everything else — `file:`, `javascript:`, custom schemes the
 * OS may hand to another application — is refused. */
export function httpUrl(v: unknown, name: string): string {
  const s = str(v, name, 4096);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return fail(name, "a valid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:")
    fail(name, "an http: or https: URL");
  return s;
}

/** A media source URL: `http:`/`https:` for a downloaded item, or `file:` for one
 * imported from disk (the local-file flow stores the path as a file URL). Everything else
 * is refused, so a crafted scheme never reaches yt-dlp or `fetch`. */
export function mediaSourceUrl(v: unknown, name: string): string {
  const s = str(v, name, 4096);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return fail(name, "a valid URL");
  }
  if (
    u.protocol !== "http:" &&
    u.protocol !== "https:" &&
    u.protocol !== "file:"
  )
    fail(name, "an http:, https:, or file: URL");
  return s;
}

/** An absolute filesystem path with no NUL byte. Does NOT prove the path is one the user
 * intended — handlers that act on user data still resolve against a known root. */
export function absPath(v: unknown, name: string): string {
  const s = nonEmptyStr(v, name, 4096);
  if (s.includes("\0") || !isAbsolute(s)) fail(name, "an absolute path");
  return s;
}

/** A single path segment safe to interpolate into a filename: no separators, no `..`,
 * no drive letters, no NUL. Use for anything that becomes part of a path on disk. */
export function pathSegment(v: unknown, name: string, max = 128): string {
  const s = nonEmptyStr(v, name, max);
  if (!/^[A-Za-z0-9._-]+$/.test(s) || s === "." || s === "..")
    fail(name, "a plain [A-Za-z0-9._-] path segment");
  return s;
}

export function optional<T>(
  v: unknown,
  parse: (value: unknown) => T,
): T | undefined {
  return v === undefined || v === null ? undefined : parse(v);
}

/** A plain object (not null, not an array). */
export function obj(v: unknown, name: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    fail(name, "an object");
  return v as Record<string, unknown>;
}
