import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseVtt, parseJson3, segmentsToText, baseLangCode } from "@sift/core";
import type { TranscriptProvider } from "@sift/core";
import type { YtDlpRunner } from "../sidecars/ytdlp";

export const YTDLP_SUBS_ID = "ytdlp-subs";

export function createYtdlpSubsProvider(deps: {
  runner: YtDlpRunner;
}): TranscriptProvider {
  const { runner } = deps;

  return {
    id: YTDLP_SUBS_ID,
    label: "Subtitles (yt-dlp)",
    canHandle(ctx) {
      if (!ctx.hasCaptions) return false;
      // Unknown caption list → keep best-effort behavior (don't regress).
      if (ctx.captionLanguages.length === 0) return true;
      const want = baseLangCode(ctx.language);
      return ctx.captionLanguages.some((l) => baseLangCode(l) === want);
    },
    async transcribe(ctx, onProgress) {
      onProgress({ stage: "fetching-subtitles", ratio: null });

      const dir = mkdtempSync(join(tmpdir(), "sift-subs-"));
      try {
        const sub = await runner.fetchSubtitles({
          url: ctx.sourceUrl,
          language: ctx.language,
          outputDir: dir,
          cookiesFile: ctx.cookiesFile ?? undefined,
        });
        if (sub === null) {
          throw new Error(
            `No ${ctx.language} captions available for this video`,
          );
        }
        const raw = readFileSync(sub.subPath, "utf8");
        const segments =
          sub.format === "json3" ? parseJson3(raw) : parseVtt(raw);
        return {
          providerId: YTDLP_SUBS_ID,
          language: ctx.language,
          text: segmentsToText(segments),
          segments,
          model: null,
        };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
