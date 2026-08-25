import type { TranscriptSegment } from "../transcript/types";

/**
 * Export presets: one library item rendered as Markdown, HTML, JSON, CSV chapters, or an
 * Obsidian note. Pure string building — writing files and rendering PDF live in the desktop
 * app, which already owns a `printToPDF` renderer for the slides export.
 */

export type ExportPreset =
  "markdown" | "html" | "json" | "csv" | "obsidian" | "pdf";

/** Presets that produce a directory rather than one file. */
export const BUNDLE_PRESETS: ExportPreset[] = ["obsidian"];

export const PRESET_EXTENSION: Record<ExportPreset, string> = {
  markdown: "md",
  html: "html",
  json: "json",
  csv: "csv",
  // An Obsidian bundle is a folder of notes; the entry note carries the .md extension.
  obsidian: "md",
  pdf: "pdf",
};

export const PRESET_LABEL: Record<ExportPreset, string> = {
  markdown: "Markdown",
  html: "HTML",
  json: "JSON",
  csv: "CSV chapters",
  obsidian: "Obsidian bundle",
  pdf: "PDF",
};

export interface ExportSummary {
  promptName: string | null;
  providerId: string;
  model: string;
  text: string;
  createdAt: number;
}

export interface ExportItem {
  title: string;
  sourceUrl: string;
  uploader: string | null;
  platformId: string;
  durationS: number | null;
  publishedAt: number | null;
  tags: string[];
  transcript: {
    language: string;
    segments: TranscriptSegment[];
    text: string;
  } | null;
  summaries: ExportSummary[];
}

/** `3723` → `01:02:03`; under an hour drops the hours field. */
export function hms(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function isoDate(ms: number | null): string {
  return ms == null ? "" : new Date(ms).toISOString().slice(0, 10);
}

/** Escapes the five characters that would otherwise be markup. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Quotes one CSV field per RFC 4180.
 *
 * A leading `=`, `+`, `-`, or `@` is prefixed with a tab as well: spreadsheets treat those as
 * the start of a formula, so a transcript line beginning "-- and then" becomes an executable
 * cell. The tab keeps the text readable and stops the evaluation.
 */
export function csvField(value: string): string {
  const risky = /^[=+\-@]/.test(value) ? `\t${value}` : value;
  return `"${risky.replace(/"/g, '""')}"`;
}

export function renderMarkdown(item: ExportItem): string {
  const lines: string[] = [`# ${item.title}`, ""];
  const meta: string[] = [];
  if (item.uploader) meta.push(`**Channel:** ${item.uploader}`);
  meta.push(`**Source:** ${item.sourceUrl}`);
  if (item.durationS != null) meta.push(`**Length:** ${hms(item.durationS)}`);
  if (item.publishedAt)
    meta.push(`**Published:** ${isoDate(item.publishedAt)}`);
  if (item.tags.length) meta.push(`**Tags:** ${item.tags.join(", ")}`);
  lines.push(meta.join("  \n"), "");

  for (const s of item.summaries) {
    lines.push(`## Summary — ${s.promptName ?? "Untitled prompt"}`, "");
    lines.push(`_${s.providerId} · ${s.model}_`, "", s.text.trim(), "");
  }

  if (item.transcript) {
    lines.push(`## Transcript (${item.transcript.language})`, "");
    if (item.transcript.segments.length > 0) {
      for (const seg of item.transcript.segments)
        lines.push(`**[${hms(seg.start)}]** ${seg.text.trim()}`, "");
    } else {
      lines.push(item.transcript.text.trim(), "");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderHtml(item: ExportItem): string {
  const parts: string[] = [];
  parts.push(
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${escapeHtml(item.title)}</title>`,
    "<style>",
    "body{font:16px/1.6 system-ui,sans-serif;max-width:44rem;margin:2rem auto;padding:0 1rem;color:#111}",
    "h1{font-size:1.6rem}h2{font-size:1.15rem;margin-top:2rem}",
    ".meta{color:#555;font-size:.9rem}",
    ".cue{display:grid;grid-template-columns:5rem 1fr;gap:.5rem;margin:.25rem 0}",
    ".t{color:#777;font-variant-numeric:tabular-nums}",
    "@media print{body{max-width:none;margin:0}}",
    "</style></head><body>",
    `<h1>${escapeHtml(item.title)}</h1>`,
  );
  const meta: string[] = [];
  if (item.uploader) meta.push(escapeHtml(item.uploader));
  if (item.durationS != null) meta.push(hms(item.durationS));
  if (item.publishedAt) meta.push(isoDate(item.publishedAt));
  parts.push(
    `<p class="meta">${meta.map(escapeHtml).join(" · ")}<br>`,
    `<a href="${escapeHtml(item.sourceUrl)}">${escapeHtml(item.sourceUrl)}</a></p>`,
  );
  if (item.tags.length)
    parts.push(
      `<p class="meta">Tags: ${item.tags.map(escapeHtml).join(", ")}</p>`,
    );

  for (const s of item.summaries) {
    parts.push(
      `<h2>Summary — ${escapeHtml(s.promptName ?? "Untitled prompt")}</h2>`,
    );
    parts.push(
      `<p class="meta">${escapeHtml(`${s.providerId} · ${s.model}`)}</p>`,
    );
    for (const para of s.text.trim().split(/\n{2,}/))
      parts.push(`<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`);
  }

  if (item.transcript) {
    parts.push(`<h2>Transcript (${escapeHtml(item.transcript.language)})</h2>`);
    if (item.transcript.segments.length > 0) {
      for (const seg of item.transcript.segments)
        parts.push(
          `<div class="cue"><span class="t">${hms(seg.start)}</span><span>${escapeHtml(seg.text.trim())}</span></div>`,
        );
    } else {
      parts.push(`<p>${escapeHtml(item.transcript.text.trim())}</p>`);
    }
  }
  parts.push("</body></html>");
  return `${parts.join("\n")}\n`;
}

export function renderJson(item: ExportItem): string {
  return `${JSON.stringify(
    {
      title: item.title,
      sourceUrl: item.sourceUrl,
      uploader: item.uploader,
      platformId: item.platformId,
      durationSeconds: item.durationS,
      publishedAt: item.publishedAt,
      tags: item.tags,
      transcript: item.transcript,
      summaries: item.summaries,
    },
    null,
    2,
  )}\n`;
}

/**
 * CSV of transcript chapters: one row per segment, with the end taken from the next
 * segment's start so the rows tile without gaps.
 *
 * Segments, not AI-detected chapters. Every timed transcript already has them, and a row per
 * cue is what a spreadsheet or a video editor can actually consume.
 */
export function renderCsv(item: ExportItem): string {
  const rows = ["start,end,startSeconds,endSeconds,text"];
  const segments = item.transcript?.segments ?? [];
  segments.forEach((seg, i) => {
    const end = segments[i + 1]?.start ?? seg.end;
    rows.push(
      [
        csvField(hms(seg.start)),
        csvField(hms(end)),
        String(seg.start),
        String(end),
        csvField(seg.text.trim()),
      ].join(","),
    );
  });
  return `${rows.join("\n")}\n`;
}

/**
 * An Obsidian note: YAML frontmatter, `[[wikilinks]]` for the channel, and `#tags`.
 *
 * Tags are sanitised to Obsidian's rules — spaces break a `#tag`, so they become hyphens.
 */
export function renderObsidianNote(item: ExportItem): string {
  const yamlString = (s: string) => JSON.stringify(s);
  const front: string[] = ["---"];
  front.push(`title: ${yamlString(item.title)}`);
  front.push(`source: ${yamlString(item.sourceUrl)}`);
  if (item.uploader) front.push(`channel: ${yamlString(item.uploader)}`);
  front.push(`platform: ${yamlString(item.platformId)}`);
  if (item.durationS != null) front.push(`duration: ${item.durationS}`);
  if (item.publishedAt) front.push(`published: ${isoDate(item.publishedAt)}`);
  if (item.tags.length)
    front.push(
      `tags: [${item.tags.map((t) => yamlString(obsidianTag(t))).join(", ")}]`,
    );
  front.push("---", "");

  const body = renderMarkdown(item);
  const linked = item.uploader
    ? body.replace(
        `**Channel:** ${item.uploader}`,
        `**Channel:** [[${item.uploader}]]`,
      )
    : body;
  return `${front.join("\n")}${linked}`;
}

/** Obsidian tags cannot contain spaces; everything else stays as typed. */
export function obsidianTag(tag: string): string {
  return tag.trim().replace(/\s+/g, "-");
}

/** The one-file presets, keyed by preset. `pdf` renders from the HTML preset. */
export function renderPreset(preset: ExportPreset, item: ExportItem): string {
  switch (preset) {
    case "markdown":
      return renderMarkdown(item);
    case "html":
    case "pdf":
      return renderHtml(item);
    case "json":
      return renderJson(item);
    case "csv":
      return renderCsv(item);
    case "obsidian":
      return renderObsidianNote(item);
  }
}
