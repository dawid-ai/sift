import { describe, expect, it } from "vitest";
import { TranscriptRegistry } from "./registry";
import { baseLangCode } from "./language";
import type { TranscriptProvider, TranscriptContext } from "./types";

function fake(id: string, can: boolean): TranscriptProvider {
  return {
    id,
    label: id,
    canHandle: () => can,
    transcribe: async () => ({
      providerId: id,
      language: "en",
      text: "",
      segments: [],
      model: null,
    }),
  };
}
const ctx: TranscriptContext = {
  sourceUrl: "u",
  hasCaptions: true,
  language: "en",
  captionLanguages: [],
  audioPath: null,
};

describe("TranscriptRegistry", () => {
  it("resolve returns the first provider whose canHandle is true, in registration order", () => {
    const r = new TranscriptRegistry();
    r.register(fake("a", false));
    r.register(fake("b", true));
    r.register(fake("c", true));
    expect(r.resolve(ctx)?.id).toBe("b");
  });
  it("resolve returns null when none can handle", () => {
    const r = new TranscriptRegistry();
    r.register(fake("a", false));
    expect(r.resolve(ctx)).toBeNull();
  });
  it("register with a duplicate id replaces in place (keeps order)", () => {
    const r = new TranscriptRegistry();
    r.register(fake("a", false));
    r.register(fake("b", true));
    r.register(fake("a", true)); // replaces a; b stays second
    expect(r.list().map((p) => p.id)).toEqual(["a", "b"]);
    expect(r.resolve(ctx)?.id).toBe("a"); // a now handles and is first
  });

  it("resolves to whisper when captions exist only in another language and audio is present", () => {
    const registry = new TranscriptRegistry();
    const ytdlpSubs: TranscriptProvider = {
      id: "ytdlp-subs",
      label: "Subtitles (yt-dlp)",
      canHandle: (c) => {
        if (!c.hasCaptions) return false;
        if (c.captionLanguages.length === 0) return true;
        const want = baseLangCode(c.language);
        return c.captionLanguages.some((l) => baseLangCode(l) === want);
      },
      transcribe: async () => ({
        providerId: "ytdlp-subs",
        language: "en",
        text: "",
        segments: [],
        model: null,
      }),
    };
    const whisperCpp: TranscriptProvider = {
      id: "whisper-cpp",
      label: "Whisper",
      canHandle: (c) => c.audioPath !== null,
      transcribe: async () => ({
        providerId: "whisper-cpp",
        language: "en",
        text: "",
        segments: [],
        model: "small",
      }),
    };
    registry.register(ytdlpSubs);
    registry.register(whisperCpp);

    const chosen = registry.resolve({
      sourceUrl: "u",
      hasCaptions: true,
      language: "en",
      captionLanguages: ["es"],
      audioPath: "/x.mp4",
    });
    expect(chosen?.id).toBe("whisper-cpp");
  });
});
