import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AiRegistry } from "@sift/core";
import { assembleSummaryContent, buildOutputBaseName, sanitizeFilename, SUMMARY_SYSTEM_PROMPT } from "@sift/core";
import type { NewMedia, SiftDatabase, SummaryRow } from "@sift/db";
import {
  getMediaBySourceUrl,
  getMediaById,
  getPromptById,
  getSummaryById,
  getTranscriptsByMediaId,
  insertMedia,
  insertSummary,
} from "@sift/db";
import type { MediaMetadata, SummaryRecord } from "@sift/ipc-contract";

// Note: deliberately does NOT import `../paths` (which imports `electron`) — this
// service must stay loadable under plain Node for its Vitest suite, mirroring
// `transcript-service.ts` / `download-service.ts`.

// duplicated (not shared with DownloadService's/TranscriptService's private
// mapper) — same ~12-line camel→snake literal, only `download_status` differs ("none"
// here since summarizing never downloads the media). Unify only if a 4th caller appears.
function fromMetadata(m: MediaMetadata): NewMedia {
  return {
    source_url: m.sourceUrl,
    platform_id: m.platform.id,
    external_id: m.externalId,
    title: m.title,
    uploader: m.uploader,
    uploader_url: m.uploaderUrl,
    duration_s: m.durationSec,
    thumbnail_path: m.thumbnailUrl,
    view_count: m.viewCount,
    like_count: m.likeCount,
    published_at: null,
    metadata_json: JSON.stringify(m.raw),
    download_status: "none",
  };
}

/** Maps a `summary` row into the renderer-facing `SummaryRecord` (snake_case → camelCase). */
function toRecord(row: SummaryRow, mediaId: number): SummaryRecord {
  return {
    id: row.id,
    mediaId,
    promptId: row.prompt_id,
    providerId: row.provider_id,
    model: row.model,
    text: row.text,
    createdAt: row.created_at,
  };
}

export interface SummarizeServiceOpts {
  db: SiftDatabase;
  registry: AiRegistry;
  downloadsDir: () => string; // resolves the current downloads dir (live config)
}

export class SummarizeService {
  constructor(private readonly opts: SummarizeServiceOpts) {}

  /**
   * Finds-or-creates the media row for `input.metadata.sourceUrl` (creating it with
   * `download_status: "none"` when it doesn't exist — summarizing never downloads
   * the video), loads the newest transcript for it, resolves the requested provider
   * and prompt, streams a summary via the provider (forwarding deltas to `onToken`),
   * persists the result, and returns the saved `SummaryRecord`.
   */
  async start(
    input: { metadata: MediaMetadata; providerId: string; model: string; promptId: number },
    onToken?: (delta: string) => void,
  ): Promise<SummaryRecord> {
    const { db, registry } = this.opts;
    const { metadata } = input;

    let media = getMediaBySourceUrl(db, metadata.sourceUrl);
    if (!media) media = insertMedia(db, fromMetadata(metadata));

    const transcripts = getTranscriptsByMediaId(db, media.id);
    const transcript = transcripts[0];
    if (!transcript) throw new Error("Get a transcript first.");

    const provider = registry.get(input.providerId);
    if (!provider) throw new Error("Unknown AI provider.");

    const prompt = getPromptById(db, input.promptId);
    if (!prompt) throw new Error("Prompt not found.");

    const content = assembleSummaryContent(prompt.body, transcript.text);
    const text = await provider.summarize(
      { model: input.model, systemPrompt: SUMMARY_SYSTEM_PROMPT, content, maxTokens: 4096 },
      (delta) => onToken?.(delta),
    );

    const row = insertSummary(db, {
      media_id: media.id,
      prompt_id: input.promptId,
      provider_id: provider.id,
      model: input.model,
      text,
    });
    return toRecord(row, media.id);
  }

  /** Writes the summary's text to a `.md` file under `downloadsDir`; returns the absolute path. */
  async export(summaryId: number): Promise<string> {
    const { db } = this.opts;
    const downloadsDir = this.opts.downloadsDir();

    const row = getSummaryById(db, summaryId);
    if (!row) throw new Error("Summary not found.");

    const media = getMediaById(db, row.media_id);
    if (!media) throw new Error("Media not found.");

    const base = buildOutputBaseName(media.uploader, media.title);
    const prompt = row.prompt_id != null ? getPromptById(db, row.prompt_id) : undefined;
    const suffix = prompt ? prompt.name : "summary";
    const fileName = `${sanitizeFilename(`${base}__${suffix}`)}.md`;
    const path = join(downloadsDir, fileName);

    mkdirSync(downloadsDir, { recursive: true });
    writeFileSync(path, row.text, "utf8");
    return path;
  }
}
