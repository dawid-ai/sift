import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { writeFileAtomicSync } from "../atomic-write";

// No `electron` import — stays Node-loadable for Vitest, like the other settings stores.

export interface WhisperConfig {
  /** File name of the selected model, e.g. `ggml-small.bin`. */
  modelName: string;
  /** ISO-639-1 code, or "auto" to let Whisper detect it. */
  language: string;
  /** Tesseract language code for slide OCR, e.g. `eng` or `eng+deu`. */
  ocrLanguage: string;
}

export const DEFAULT_WHISPER_CONFIG: WhisperConfig = {
  modelName: "ggml-small.bin",
  language: "auto",
  ocrLanguage: "eng",
};

/**
 * Tesseract language codes are interpolated into a filename (`<lang>.traineddata`) and into
 * a worker option, so they are restricted to the exact shape upstream uses: three-letter
 * codes, optionally with a script suffix, joined by `+`.
 */
const OCR_LANGUAGE_RE = /^[a-z]{3}(_[a-z]+)?(\+[a-z]{3}(_[a-z]+)?)*$/;

/** Whisper language codes are one argv value; "auto" means detect. */
const LANGUAGE_RE = /^(auto|[a-z]{2}(-[a-z]{2})?)$/i;

export function isOcrLanguage(value: string): boolean {
  return OCR_LANGUAGE_RE.test(value);
}

export function isWhisperLanguage(value: string): boolean {
  return LANGUAGE_RE.test(value);
}

export interface WhisperConfigDeps {
  filePath: string;
  /** Names the model picker accepts. Injected so the store never imports the catalog. */
  isKnownModel: (name: string) => boolean;
  fs?: {
    existsSync(p: string): boolean;
    readFileSync(p: string): Buffer;
    writeFileSync(p: string, d: Buffer): void;
    rmSync(p: string, opts: { force: boolean }): void;
    mkdirSync(p: string, opts: { recursive: boolean }): void;
  };
}

const defaultFs: NonNullable<WhisperConfigDeps["fs"]> = {
  existsSync,
  readFileSync,
  writeFileSync: writeFileAtomicSync,
  rmSync,
  mkdirSync,
};

export function createWhisperConfigStore(deps: WhisperConfigDeps): {
  get(): WhisperConfig;
  set(config: WhisperConfig): WhisperConfig;
} {
  const { filePath, isKnownModel } = deps;
  const fs = deps.fs ?? defaultFs;

  /** Every field is checked on the way in AND on the way out: the file is user-editable, and
   * two of these three values reach a filename or a child process's argv. */
  const normalize = (raw: Partial<WhisperConfig> | null): WhisperConfig => ({
    modelName:
      typeof raw?.modelName === "string" && isKnownModel(raw.modelName)
        ? raw.modelName
        : DEFAULT_WHISPER_CONFIG.modelName,
    language:
      typeof raw?.language === "string" && isWhisperLanguage(raw.language)
        ? raw.language.toLowerCase()
        : DEFAULT_WHISPER_CONFIG.language,
    ocrLanguage:
      typeof raw?.ocrLanguage === "string" && isOcrLanguage(raw.ocrLanguage)
        ? raw.ocrLanguage
        : DEFAULT_WHISPER_CONFIG.ocrLanguage,
  });

  return {
    get(): WhisperConfig {
      if (!fs.existsSync(filePath)) return { ...DEFAULT_WHISPER_CONFIG };
      try {
        return normalize(
          JSON.parse(
            fs.readFileSync(filePath).toString("utf8"),
          ) as Partial<WhisperConfig> | null,
        );
      } catch {
        return { ...DEFAULT_WHISPER_CONFIG };
      }
    },
    set(config: WhisperConfig): WhisperConfig {
      const normalized = normalize(config);
      fs.mkdirSync(dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        Buffer.from(JSON.stringify(normalized), "utf8"),
      );
      return normalized;
    },
  };
}
