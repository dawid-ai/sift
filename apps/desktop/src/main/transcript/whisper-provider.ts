import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { segmentsToText } from "@sift/core";
import type { TranscriptProvider } from "@sift/core";
import type { FfmpegRunner } from "../sidecars/ffmpeg";
import type { WhisperRunner } from "../sidecars/whisper";

export const WHISPER_CPP_ID = "whisper-cpp";

/** Local transcription for DOWNLOADED videos: ffmpeg → 16 kHz mono WAV → whisper.cpp.
 * Registered AFTER `ytdlp-subs`, so it only runs when captions are absent, or exist
 * only in a language other than the one resolved for this video (see
 * `ytdlp-subs-provider.ts`'s `canHandle`). */
export function createWhisperProvider(deps: {
  ffmpeg: FfmpegRunner;
  whisper: WhisperRunner;
  /** binary + model both present on disk */
  isInstalled: () => boolean;
}): TranscriptProvider {
  return {
    id: WHISPER_CPP_ID,
    label: "Local (whisper.cpp)",
    local: true,
    canHandle(ctx) {
      return ctx.audioPath !== null && deps.isInstalled();
    },
    async transcribe(ctx, onProgress) {
      if (!ctx.audioPath) throw new Error("whisper provider requires a downloaded audio file");
      const dir = mkdtempSync(join(tmpdir(), "sift-whisper-"));
      const wavPath = join(dir, "audio.wav");
      try {
        onProgress({ stage: "extracting-audio", ratio: null });
        await deps.ffmpeg.extractWav({ inputPath: ctx.audioPath, outputPath: wavPath });

        onProgress({ stage: "transcribing", ratio: null });
        const { segments } = await deps.whisper.transcribe({ wavPath, language: ctx.language });

        return {
          providerId: WHISPER_CPP_ID,
          language: ctx.language,
          text: segmentsToText(segments),
          segments,
          model: "small",
        };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
