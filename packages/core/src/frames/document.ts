// No-AI document export: interleaves transcript segments with the selected slide
// images at their timestamps. Pure/framework-free — the caller resolves `src` to
// whatever the target format needs (a file:// URL for Markdown, a data: URI for HTML),
// so this module never touches the filesystem or an AI provider.
//
// The AI-polished tier distills the WHOLE transcript at once: `toMarkeredTranscript`
// serialises the interleaved blocks to one string with `[[SLIDE n]]` placeholders, the
// model rewrites it into a knowledge document (keeping/repositioning the markers), and
// `fromMarkeredOutput` splices the real slide images back in. One call, full context —
// so the model can reorganise into headers instead of cleaning sentences in isolation.

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

export type Block =
  { kind: "text"; text: string } | { kind: "frame"; src: string; tsMs: number };

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
export function buildDocumentBlocks(
  segments: DocSegment[],
  frames: DocFrame[],
): Block[] {
  const timeline: { t: number; order: number; block: Block }[] = [
    ...segments.map((s) => ({
      t: s.start,
      order: 0,
      block: { kind: "text", text: s.text } as Block,
    })),
    ...frames.map((f) => ({
      t: f.tsMs / 1000,
      order: 1,
      block: { kind: "frame", src: f.src, tsMs: f.tsMs } as Block,
    })),
  ];
  timeline.sort((a, b) => a.t - b.t || a.order - b.order);

  const out: Block[] = [];
  for (const { block } of timeline) {
    const last = out[out.length - 1];
    if (block.kind === "text" && last?.kind === "text")
      last.text = `${last.text} ${block.text}`.trim();
    else out.push(block.kind === "text" ? { ...block } : block);
  }
  return out;
}

/**
 * Serialises interleaved blocks to a single transcript string with numbered `[[SLIDE n]]`
 * placeholders (1-indexed), returning the slide blocks in marker order so `fromMarkeredOutput`
 * can map each marker back to its image. This whole string is what the distillation model sees.
 */
export function toMarkeredTranscript(blocks: Block[]): {
  text: string;
  slides: Block[];
} {
  const slides: Block[] = [];
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.kind === "text") parts.push(b.text);
    else {
      slides.push(b);
      parts.push(`[[SLIDE ${slides.length}]]`);
    }
  }
  return { text: parts.join("\n\n"), slides };
}

/**
 * Parses the model's distilled output back into blocks: text between `[[SLIDE n]]` markers
 * becomes text blocks, each marker becomes the corresponding slide image. Tolerant of a model
 * that drops, reorders, or duplicates markers; any slide the model never referenced is appended
 * at the end so no image is silently lost.
 */
export function fromMarkeredOutput(output: string, slides: Block[]): Block[] {
  const out: Block[] = [];
  const used = new Set<number>();
  const re = /\[\[\s*SLIDE\s+(\d+)\s*\]\]/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(output))) {
    const before = output.slice(last, m.index).trim();
    if (before) out.push({ kind: "text", text: before });
    const idx = Number(m[1]) - 1;
    const slide = slides[idx];
    if (slide && !used.has(idx)) {
      out.push(slide);
      used.add(idx);
    }
    last = re.lastIndex;
  }
  const tail = output.slice(last).trim();
  if (tail) out.push({ kind: "text", text: tail });
  for (let i = 0; i < slides.length; i++)
    if (!used.has(i)) out.push(slides[i]!);
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Markdown from pre-built blocks: title, then paragraphs and `![](src)` slide images. */
export function renderMarkdownBlocks(title: string, blocks: Block[]): string {
  const parts = [`# ${title}`];
  for (const b of blocks) {
    if (b.kind === "text") parts.push(b.text);
    else
      parts.push(
        `![slide ${formatTs(b.tsMs / 1000)}](${b.src})\n\n*${formatTs(b.tsMs / 1000)}*`,
      );
  }
  return `${parts.join("\n\n")}\n`;
}

function inlineMd(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** Minimal Markdown → HTML for a document body: ATX headers, bullet lists, and blank-line
 * paragraphs, with inline bold/italic/code. Enough for the distilled knowledge document; plain
 * text (the raw tier) passes through as a single paragraph. ponytail: no nested lists / tables /
 * links — add a real Markdown lib only if the model output outgrows this. */
export function markdownToHtml(md: string): string {
  const html: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) html.push(`<p>${inlineMd(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length)
      html.push(
        `<ul>${list.map((li) => `<li>${inlineMd(li)}</li>`).join("")}</ul>`,
      );
    list = [];
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    const header = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (header) {
      flushPara();
      flushList();
      const level = header[1]!.length;
      html.push(`<h${level}>${inlineMd(header[2]!)}</h${level}>`);
    } else if (bullet) {
      flushPara();
      list.push(bullet[1]!);
    } else if (line === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return html.join("\n");
}

/** Self-contained HTML from pre-built blocks (feeds Electron printToPDF). Images as data: URIs.
 * Text blocks are treated as Markdown so the distilled document's headers/bullets render. */
export function renderHtmlBlocks(title: string, blocks: Block[]): string {
  const body = blocks
    .map((b) =>
      b.kind === "text"
        ? markdownToHtml(b.text)
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
  h2 { font-size: 1.3rem; margin-top: 1.6rem; }
  h3 { font-size: 1.1rem; margin-top: 1.2rem; }
  p { margin: 0.6rem 0; }
  ul { margin: 0.6rem 0; padding-left: 1.4rem; }
  li { margin: 0.2rem 0; }
  code { background: #f2f2f2; border-radius: 3px; padding: 0 0.25em; font-size: 0.9em; }
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

/** Raw (no-AI) Markdown document: interleaves segments + slides by timestamp. */
export function renderMarkdownDocument(
  title: string,
  segments: DocSegment[],
  frames: DocFrame[],
): string {
  return renderMarkdownBlocks(title, buildDocumentBlocks(segments, frames));
}

/** Raw (no-AI) HTML document (feeds Electron printToPDF). */
export function renderHtmlDocument(
  title: string,
  segments: DocSegment[],
  frames: DocFrame[],
): string {
  return renderHtmlBlocks(title, buildDocumentBlocks(segments, frames));
}
