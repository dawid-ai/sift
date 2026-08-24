import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  CLIP_EXTENSION,
  clipArgs,
  normalizeRange,
  sanitizeFilename,
  timestampedUrl,
  type ClipKind,
  type ClipRange,
} from "@sift/core";
import {
  getMediaById,
  listDownloadsByMediaId,
  type SiftDatabase,
} from "@sift/db";
import { resolveOutputPath } from "./output-path";

/**
 * Cuts a span out of a downloaded file, or turns it into a shareable timestamped link.
 *
 * The ffmpeg invocation is built by `@sift/core`'s `clipArgs`, which is unit-tested; this
 * service resolves which file to cut, where to write, and runs the process.
 */
export interface ClipServiceDeps {
  db: SiftDatabase;
  outputDir: () => string;
  /** Runs ffmpeg with the given argv. Injected so the service is testable without a binary. */
  runFfmpeg: (args: string[]) => Promise<void>;
}

export interface ClipResult {
  path: string;
  kind: ClipKind;
  startSeconds: number;
  endSeconds: number;
}

export class ClipService {
  constructor(private readonly deps: ClipServiceDeps) {}

  /** A link into the source at `seconds`, or null when the platform has no such parameter. */
  link(mediaId: number, seconds: number): string | null {
    const media = getMediaById(this.deps.db, mediaId);
    if (!media) throw new Error(`No media with id ${mediaId}.`);
    const url = timestampedUrl(media.source_url, seconds);
    return url === media.source_url ? null : url;
  }

  async export(input: {
    mediaId: number;
    kind: ClipKind;
    range: ClipRange;
  }): Promise<ClipResult> {
    const { db } = this.deps;
    const media = getMediaById(db, input.mediaId);
    if (!media) throw new Error(`No media with id ${input.mediaId}.`);

    // Prefer the row that actually has a file. A media row can carry several download rows
    // (one per format) and only some of them completed.
    const source = listDownloadsByMediaId(db, input.mediaId).find(
      (d) => d.status === "done" && d.file_path,
    );
    if (!source?.file_path)
      throw new Error(
        "Clipping needs the media file on disk. Download this video first.",
      );

    const range = normalizeRange(input.range);
    if (range.endSeconds - range.startSeconds < 0.1)
      throw new Error("Select a longer span to clip.");

    const dir = join(this.deps.outputDir(), "clips");
    mkdirSync(dir, { recursive: true });
    const stamp = `${Math.floor(range.startSeconds)}-${Math.ceil(range.endSeconds)}`;
    const base =
      `${sanitizeFilename(media.title) || `media-${input.mediaId}`} ${stamp}` +
      (input.kind === "vertical" ? " vertical" : "");
    // Content-compared against an empty string: a clip's bytes are not known until ffmpeg has
    // run, so this only reserves the next free name rather than reusing an identical file.
    const outputPath = resolveOutputPath(
      dir,
      base,
      CLIP_EXTENSION[input.kind],
      "",
    );

    await this.deps.runFfmpeg(
      clipArgs({
        inputPath: source.file_path,
        outputPath,
        kind: input.kind,
        range,
      }),
    );
    return { path: outputPath, kind: input.kind, ...range };
  }
}
