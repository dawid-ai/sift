import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { TranscriptContext } from "@sift/core";
import { createWhisperProvider, WHISPER_CPP_ID } from "./whisper-provider";

const baseCtx: TranscriptContext = {
  sourceUrl: "https://x/v",
  hasCaptions: false,
  language: "en",
  captionLanguages: [],
  audioPath: "/downloads/video.mp4",
  cookiesFile: null,
};

function fakes() {
  return {
    ffmpeg: {
      extractWav: vi.fn().mockResolvedValue(undefined),
      detectSceneTimes: vi.fn().mockResolvedValue([]),
      extractFrameAt: vi.fn().mockResolvedValue(undefined),
    },
    whisper: {
      transcribe: vi.fn().mockResolvedValue({
        segments: [
          { start: 0, end: 2, text: "hello" },
          { start: 2, end: 4, text: "world" },
        ],
      }),
    },
  };
}

describe("whisper provider canHandle", () => {
  it("handles a downloaded file when installed", () => {
    const p = createWhisperProvider({ ...fakes(), isInstalled: () => true });
    expect(p.canHandle(baseCtx)).toBe(true);
  });
  it("declines when not installed", () => {
    const p = createWhisperProvider({ ...fakes(), isInstalled: () => false });
    expect(p.canHandle(baseCtx)).toBe(false);
  });
  it("declines when there is no downloaded audio", () => {
    const p = createWhisperProvider({ ...fakes(), isInstalled: () => true });
    expect(p.canHandle({ ...baseCtx, audioPath: null })).toBe(false);
  });
});

describe("whisper provider transcribe", () => {
  it("extracts WAV, transcribes, returns segments + model 'small', cleans up temp", async () => {
    const f = fakes();
    const p = createWhisperProvider({ ...f, isInstalled: () => true });
    const result = await p.transcribe(baseCtx, () => {});

    expect(f.ffmpeg.extractWav).toHaveBeenCalledOnce();
    const wavArg = f.ffmpeg.extractWav.mock.calls[0]![0] as { inputPath: string; outputPath: string };
    expect(wavArg.inputPath).toBe("/downloads/video.mp4");
    expect(f.whisper.transcribe).toHaveBeenCalledWith({ wavPath: wavArg.outputPath, language: "en" });

    expect(result.providerId).toBe(WHISPER_CPP_ID);
    expect(result.model).toBe("small");
    expect(result.language).toBe("en");
    expect(result.segments).toHaveLength(2);
    expect(result.text).toBe("hello\nworld");
    // temp WAV dir removed
    expect(existsSync(wavArg.outputPath)).toBe(false);
  });
});
