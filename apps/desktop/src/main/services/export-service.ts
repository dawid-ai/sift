import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BUNDLE_PRESETS,
  PRESET_EXTENSION,
  obsidianTag,
  renderPreset,
  sanitizeFilename,
  type ExportItem,
  type ExportPreset,
} from "@sift/core";
import {
  getMediaById,
  getSummariesByMediaId,
  getTranscriptsByMediaId,
  getPromptById,
  tagsForMedia,
  type SiftDatabase,
  type TranscriptRow,
} from "@sift/db";
import { resolveOutputPath } from "./output-path";

/**
 * Writes one library item in a chosen format.
 *
 * The rendering itself is `@sift/core`'s `renderPreset` — this service is the part that needs
 * the database, the filesystem, and (for PDF) Electron's print pipeline.
 */
export interface ExportServiceDeps {
  db: SiftDatabase;
  /** Where exports land. Same directory the summary and SRT exports use. */
  outputDir: () => string;
  /** Renders self-contained HTML to a PDF buffer (Electron printToPDF, injected by index.ts). */
  renderPdf: (html: string) => Promise<Buffer>;
}

export interface ExportResult {
  path: string;
  preset: ExportPreset;
}

function parseSegments(
  row: TranscriptRow | undefined,
): ExportItem["transcript"] {
  if (!row) return null;
  let segments: ExportItem["transcript"] extends null
    ? never
    : NonNullable<ExportItem["transcript"]>["segments"] = [];
  if (row.segments_json) {
    try {
      const parsed: unknown = JSON.parse(row.segments_json);
      if (Array.isArray(parsed)) segments = parsed as typeof segments;
    } catch {
      // A malformed segments blob costs the timestamps, not the export — `text` still ships.
    }
  }
  // `language` is nullable in the schema (a whisper run can finish without detecting one);
  // the export just says so rather than printing "null".
  return { language: row.language ?? "unknown", segments, text: row.text };
}

export class ExportService {
  constructor(private readonly deps: ExportServiceDeps) {}

  /** Assembles everything the renderers need for one media row. */
  buildItem(mediaId: number): ExportItem {
    const { db } = this.deps;
    const media = getMediaById(db, mediaId);
    if (!media) throw new Error(`No media with id ${mediaId}.`);
    const transcripts = getTranscriptsByMediaId(db, mediaId);
    return {
      title: media.title,
      sourceUrl: media.source_url,
      uploader: media.uploader,
      platformId: media.platform_id,
      durationS: media.duration_s,
      publishedAt: media.published_at,
      tags: tagsForMedia(db, mediaId),
      transcript: parseSegments(transcripts[0]),
      summaries: getSummariesByMediaId(db, mediaId).map((s) => ({
        // A summary can predate prompts, or its prompt can since have been deleted.
        promptName:
          s.prompt_id === null
            ? null
            : (getPromptById(db, s.prompt_id)?.name ?? null),
        providerId: s.provider_id,
        model: s.model,
        text: s.text,
        createdAt: s.created_at,
      })),
    };
  }

  async export(mediaId: number, preset: ExportPreset): Promise<ExportResult> {
    const item = this.buildItem(mediaId);
    const base = sanitizeFilename(item.title) || `media-${mediaId}`;
    const dir = this.deps.outputDir();
    mkdirSync(dir, { recursive: true });

    if (BUNDLE_PRESETS.includes(preset))
      return { path: this.writeObsidianBundle(dir, base, item), preset };

    const body = renderPreset(preset, item);
    // PDF is compared by its rendered bytes, not by the HTML it came from, so a re-export
    // of unchanged content still reuses the plain filename instead of taking " (2)".
    const payload = preset === "pdf" ? await this.deps.renderPdf(body) : body;
    const target = resolveOutputPath(
      dir,
      base,
      PRESET_EXTENSION[preset],
      payload,
    );
    writeFileSync(target, payload);
    return { path: target, preset };
  }

  /**
   * An Obsidian bundle is a folder: the note, plus a sibling `transcript.md` when there is a
   * timed transcript. Splitting them keeps the note readable in the graph view — a two-hour
   * transcript inline makes the note useless to skim, and Obsidian links the two anyway.
   */
  private writeObsidianBundle(
    dir: string,
    base: string,
    item: ExportItem,
  ): string {
    const bundleDir = join(dir, `${base} (Obsidian)`);
    mkdirSync(bundleDir, { recursive: true });
    const notePath = join(bundleDir, `${base}.md`);

    const hasTranscript = (item.transcript?.segments.length ?? 0) > 0;
    const note = renderPreset("obsidian", {
      ...item,
      // The note links to the transcript rather than embedding it.
      transcript: hasTranscript ? null : item.transcript,
    });
    writeFileSync(
      notePath,
      hasTranscript
        ? `${note}\n## Transcript\n\n![[${base} transcript]]\n`
        : note,
      "utf8",
    );

    if (hasTranscript) {
      writeFileSync(
        join(bundleDir, `${base} transcript.md`),
        renderPreset("markdown", { ...item, summaries: [] }),
        "utf8",
      );
    }
    // Tags go in the note's frontmatter; this file records them for a vault that indexes
    // folders rather than notes.
    if (item.tags.length > 0)
      writeFileSync(
        join(bundleDir, "tags.md"),
        `${item.tags.map((t) => `#${obsidianTag(t)}`).join(" ")}\n`,
        "utf8",
      );
    return bundleDir;
  }
}
