import { ipcMain } from "electron";
import { IPC } from "@sift/ipc-contract";
import { WHISPER_MODELS } from "@sift/binaries";
import {
  isOcrLanguage,
  isWhisperLanguage,
  type WhisperConfig,
} from "../settings/whisper-config";
import { nonEmptyStr, obj } from "./validate";

/** Registers `whisper:getConfig` / `whisper:setConfig` / `whisper:models`. */
export function registerWhisperConfigIpc(store: {
  get(): WhisperConfig;
  set(config: WhisperConfig): WhisperConfig;
}): void {
  ipcMain.handle(IPC.whisperModels, () =>
    WHISPER_MODELS.map((m) => ({
      name: m.name,
      label: m.label,
      approxBytes: m.approxBytes,
    })),
  );

  ipcMain.handle(IPC.whisperGetConfig, () => store.get());

  ipcMain.handle(IPC.whisperSetConfig, (_e, raw: unknown) => {
    const c = obj(raw, "config");
    const language = nonEmptyStr(c.language, "config.language", 16);
    const ocrLanguage = nonEmptyStr(c.ocrLanguage, "config.ocrLanguage", 64);
    // Both reach a child process's argv or a filename; the store re-checks them, but
    // rejecting here is what turns a bad value into a visible error rather than a silent
    // fall back to the default.
    if (!isWhisperLanguage(language))
      throw new Error(`Not a language code: ${language}`);
    if (!isOcrLanguage(ocrLanguage))
      throw new Error(`Not an OCR language code: ${ocrLanguage}`);
    return store.set({
      modelName: nonEmptyStr(c.modelName, "config.modelName", 128),
      language,
      ocrLanguage,
    });
  });
}
