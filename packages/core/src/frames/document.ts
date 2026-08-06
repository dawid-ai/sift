// No-AI document export: interleaves transcript segments with the selected slide
// images at their timestamps. Pure/framework-free — the caller resolves `src` to
// whatever the target format needs (a file:// URL for Markdown, a data: URI for HTML),
// so this module never touches the filesystem or an AI provider.

/** A transcript segment anchored at `start` seconds. */
export interface DocSegment {
  start: number;
  text: string;
}

/** A selected slide image to drop into the flow, anchored at `tsMs` milliseconds.
 * `src` is already resolved by the caller (file:// for md, data: URI for html). */
export interface DocFrame {
  tsMs: number;
  src: string;
}

type Block = { kind: "text"; text: string } | { kind: "frame"; src: string; tsMs: number };

/** `12.5` s → `00:12` (or `1:02:03` past an hour). */
function formatTs(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Merges segments and frames onto one timeline, then coalesces runs of adjacent
 * transcript segments into a single paragraph (whisper emits ~one sentence per
 * segment). At an exact tie the slide comes after the narration at that moment.
 */
function interleave(segments: DocSegment[], frames: DocFrame[]): Block[] {
  const timeline: { t: number; order: number; block: Block }[] = [
    ...segments.map((s) => ({ t: s.start, order: 0, block: { kind: "text", text: s.text } as Block })),
    ...frames.map((f) => ({ t: f.tsMs / 1000, order: 1, block: { kind: "frame", src: f.src, tsMs: f.tsMs } as Block })),
  ];
  timeline.sort((a, b) => a.t - b.t || a.order - b.order);

  const out: Block[] = [];
  for (const { block } of timeline) {
    const last = out[out.length - 1];
    if (block.kind === "text" && last?.kind === "text") last.text = `${last.text} ${block.text}`.trim();
    else out.push(block.kind === "text" ? { ...block } : block);
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Markdown document: title, then interleaved paragraphs and `![](src)` slide images. */
export function renderMarkdownDocument(title: string, segments: DocSegment[], frames: DocFrame[]): string {
  const parts = [`# ${title}`];
  for (const b of interleave(segments, frames)) {
    if (b.kind === "text") parts.push(b.text);
    else parts.push(`![slide ${formatTs(b.tsMs / 1000)}](${b.src})\n\n*${formatTs(b.tsMs / 1000)}*`);
  }
  return `${parts.join("\n\n")}\n`;
}

/** Self-contained HTML document (feeds Electron printToPDF). Images are expected as data: URIs. */
export function renderHtmlDocument(title: string, segments: DocSegment[], frames: DocFrame[]): string {
  const body = interleave(segments, frames)
    .map((b) =>
      b.kind === "text"
        ? `<p>${escapeHtml(b.text)}</p>`
        : `<figure><img src="${b.src}" alt="slide" /><figcaption>${formatTs(b.tsMs / 1000)}</figcaption></figure>`,
    )
    .join("\n");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font: 15px/1.6 -apple-system, system-ui, sans-serif; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 1.6rem; }
  p { margin: 0.6rem 0; }
  figure { margin: 1.4rem 0; break-inside: avoid; }
  img { max-width: 100%; border: 1px solid #ddd; border-radius: 4px; }
  figcaption { font-size: 0.8rem; color: #888; margin-top: 0.3rem; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>
`;
}
