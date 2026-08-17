import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AiRegistry } from "@sift/core";
import {
  buildDocumentBlocks,
  buildOutputBaseName,
  fromMarkeredOutput,
  POLISH_SYSTEM_PROMPT,
  renderHtmlBlocks,
  renderMarkdownBlocks,
  sanitizeFilename,
  toMarkeredTranscript,
  type Block,
  type DocFrame,
  type DocSegment,
} from "@sift/core";
import type { SiftDatabase } from "@sift/db";
import {
  getFramesByMediaId,
  getMediaById,
  getTranscriptsByMediaId,
  insertDocument,
} from "@sift/db";

// Note: deliberately does NOT import `../paths` or `electron` — kept Node-loadable like
// summarize-service. The PDF renderer (which needs a BrowserWindow) is injected.

export type ExportFormat = "md" | "pdf";
export interface ExportPolish {
  providerId: string;
  model: string;
}
export interface ExportProgress {
  processed: number;
  total: number;
}

export interface FrameExportOpts {
  db: SiftDatabase;
  registry: AiRegistry;
  downloadsDir: () => string;
  /** Renders self-contained HTML to a PDF buffer (Electron printToPDF, injected by index.ts). */
  renderPdf: (html: string) => Promise<Buffer>;
}

function imageMime(path: string): string {
  return path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

/** Builds a transcript + selected-slides document (Tier 0 raw, or AI-polished): interleaves
 * included frames' images into the transcript at their timestamps, writing Markdown or PDF. */
export class FrameExportService {
  constructor(private readonly opts: FrameExportOpts) {}

  async export(
    mediaId: number,
    format: ExportFormat,
    polish?: ExportPolish,
    onProgress?: (p: ExportProgress) => void,
  ): Promise<string> {
    const { db } = this.opts;
    const media = getMediaById(db, mediaId);
    if (!media) throw new Error("Media not found.");

    const transcript = getTranscriptsByMediaId(db, mediaId)[0];
    if (!transcript) throw new Error("Get a transcript first.");

    const frames = getFramesByMediaId(db, mediaId).filter(
      (f) => f.included === 1,
    );

    // Segments are the interleave anchors. ponytail: a provider that stored no segments
    // (segments_json null) can't be interleaved — fall back to the whole transcript as one
    // block, so frames just follow the text.
    const parsed: DocSegment[] = transcript.segments_json
      ? JSON.parse(transcript.segments_json)
      : [];
    const segments: DocSegment[] = parsed.length
      ? parsed
      : [{ start: 0, text: transcript.text }];

    // Slides are hard boundaries, so the AI polish (below) only rewrites text runs and
    // leaves slide placement untouched. Frame `src` differs by format: file:// for Markdown
    // (portable local ref), a base64 data: URI for the self-contained PDF.
    const docFrames: DocFrame[] =
      format === "md"
        ? frames.map((f) => ({
            tsMs: f.ts_ms,
            src: pathToFileURL(f.image_path).href,
          }))
        : frames.map((f) => ({
            tsMs: f.ts_ms,
            src: `data:${imageMime(f.image_path)};base64,${readFileSync(f.image_path).toString("base64")}`,
          }));

    let blocks: Block[] = buildDocumentBlocks(segments, docFrames);
    if (polish) blocks = await this.polish(blocks, polish, onProgress);

    const base = sanitizeFilename(
      `${buildOutputBaseName(media.uploader, media.title)}__document`,
    );
    const dir = this.opts.downloadsDir();
    mkdirSync(dir, { recursive: true });

    const path = join(dir, `${base}.${format}`);
    if (format === "md")
      writeFileSync(path, renderMarkdownBlocks(media.title, blocks), "utf8");
    else
      writeFileSync(
        path,
        await this.opts.renderPdf(renderHtmlBlocks(media.title, blocks)),
      );

    // Track it so the Files tab can list every document created for this video (persistent).
    insertDocument(db, {
      media_id: mediaId,
      format,
      path,
      provider_id: polish?.providerId ?? null,
      model: polish?.model ?? null,
    });
    return path;
  }

  /** Distills the WHOLE transcript in one call: serialise blocks → `[[SLIDE n]]` markers →
   * model rewrites into a knowledge document → splice the slide images back in. One call gives
   * the model full context to reorganise into headers; on failure we fall back to the raw blocks
   * so a document is still produced. */
  private async polish(
    blocks: Block[],
    polish: ExportPolish,
    onProgress?: (p: ExportProgress) => void,
  ): Promise<Block[]> {
    const provider = this.opts.registry.get(polish.providerId);
    if (!provider) throw new Error("Unknown AI provider for polish.");
    const { text, slides } = toMarkeredTranscript(blocks);
    onProgress?.({ processed: 0, total: 1 });
    try {
      const out = await provider.summarize(
        {
          model: polish.model,
          systemPrompt: POLISH_SYSTEM_PROMPT,
          content: text,
          maxTokens: 8192,
        },
        () => {},
      );
      onProgress?.({ processed: 1, total: 1 });
      const distilled = out.trim();
      return distilled ? fromMarkeredOutput(distilled, slides) : blocks;
    } catch {
      onProgress?.({ processed: 1, total: 1 });
      return blocks; // model unavailable/failed — still emit the raw document
    }
  }
}
