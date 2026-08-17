import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { baseLangCode } from "@sift/core";

// Note: no `electron` import — this module + its Vitest suite stay Node-loadable,
// mirroring `ai/custom-config.ts`. Real wiring passes `{ filePath: transcriptConfigFile() }`.

const DEFAULT: string[] = ["en"];

export interface TranscriptConfigDeps {
  filePath: string;
  fs?: {
    existsSync(p: string): boolean;
    readFileSync(p: string): Buffer;
    writeFileSync(p: string, data: Buffer): void;
    rmSync(p: string, opts: { force: boolean }): void;
    mkdirSync(p: string, opts: { recursive: boolean }): void;
  };
}

const defaultFs: NonNullable<TranscriptConfigDeps["fs"]> = {
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
};

/** Base-code, dedup, drop empties; `["en"]` if nothing usable remains. */
function normalize(langs: unknown): string[] {
  if (!Array.isArray(langs)) return [...DEFAULT];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of langs) {
    if (typeof raw !== "string") continue;
    const code = baseLangCode(raw);
    if (code && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out.length > 0 ? out : [...DEFAULT];
}

/** Ordered preferred transcript languages (first = default). Graceful default `["en"]`. */
export function createTranscriptConfigStore(deps: TranscriptConfigDeps): {
  get(): string[];
  set(langs: string[]): void;
} {
  const { filePath } = deps;
  const fs = deps.fs ?? defaultFs;
  return {
    get(): string[] {
      if (!fs.existsSync(filePath)) return [...DEFAULT];
      try {
        const parsed: unknown = JSON.parse(
          fs.readFileSync(filePath).toString("utf8"),
        );
        const langs = (parsed as { languages?: unknown } | null)?.languages;
        return normalize(langs);
      } catch {
        console.warn(
          "Stored transcript-language config could not be parsed; using default.",
        );
        return [...DEFAULT];
      }
    },
    set(langs: string[]): void {
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        Buffer.from(JSON.stringify({ languages: normalize(langs) }), "utf8"),
      );
    },
  };
}
