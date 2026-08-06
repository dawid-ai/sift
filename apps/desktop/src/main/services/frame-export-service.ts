import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildOutputBaseName,
  renderHtmlDocument,
  renderMarkdownDocument,
  sanitizeFilename,
  type DocFrame,
  type DocSegment,
} from "@sift/core";
import type { SiftDatabase } from "@sift/db";
import { getFramesByMediaId, getMediaById, getTranscriptsByMediaId } from "@sift/db";

// Note: deliberately does NOT import `../paths` or `electron` — kept Node-loadable like
// summarize-service. The PDF renderer (which needs a BrowserWindow) is injected.

export type ExportFormat = "md" | "pdf";

export interface FrameExportOpts {
  db: SiftDatabase;
  downloadsDir: () => string;
  /** Renders self-contained HTML to a PDF buffer (Electron printToPDF, injected by index.ts). */
  renderPdf: (html: string) => Promise<Buffer>;
}

function imageMime(path: string): string {
  return path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

/** Builds a transcript + selected-slides document (no AI): interleaves included frames'
 * images into the transcript at their timestamps, writing Markdown or PDF to Downloads. */
export class FrameExportService {
  constructor(private readonly opts: FrameExportOpts) {}

  async export(mediaId: number, format: ExportFormat): Promise<string> {
    const { db } = this.opts;
    const media = getMediaById(db, mediaId);
    if (!media) throw new Error("Media not found.");

    const transcript = getTranscriptsByMediaId(db, mediaId)[0];
    if (!transcript) throw new Error("Get a transcript first.");

    const frames = getFramesByMediaId(db, mediaId).filter((f) => f.included === 1);

    // Segments are the interleave anchors. ponytail: a provider that stored no segments
    // (segments_json null) can't be interleaved — fall back to the whole transcript as one
    // block, so frames just follow the text. Upgrade path: none needed unless captions-only
    // sources without segments become common.
    const parsed: DocSegment[] = transcript.segments_json ? JSON.parse(transcript.segments_json) : [];
    const segments: DocSegment[] = parsed.length ? parsed : [{ start: 0, text: transcript.text }];

    const base = sanitizeFilename(`${buildOutputBaseName(media.uploader, media.title)}__document`);
    const dir = this.opts.downloadsDir();
    mkdirSync(dir, { recursive: true });

    if (format === "md") {
      const docFrames: DocFrame[] = frames.map((f) => ({ tsMs: f.ts_ms, src: pathToFileURL(f.image_path).href }));
      const path = join(dir, `${base}.md`);
      writeFileSync(path, renderMarkdownDocument(media.title, segments, docFrames), "utf8");
      return path;
    }

    // PDF: images must be self-contained (the print window has no sift-frame:// context
    // guarantees and a giant data: URL is simpler than wiring the protocol) → data: URIs.
    const docFrames: DocFrame[] = frames.map((f) => ({
      tsMs: f.ts_ms,
      src: `data:${imageMime(f.image_path)};base64,${readFileSync(f.image_path).toString("base64")}`,
    }));
    const html = renderHtmlDocument(media.title, segments, docFrames);
    const path = join(dir, `${base}.pdf`);
    writeFileSync(path, await this.opts.renderPdf(html));
    return path;
  }
}
