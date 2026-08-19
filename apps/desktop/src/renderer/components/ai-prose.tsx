/**
 * Renders an AI-written summary as structured prose.
 *
 * Why this exists: summaries were painted into a single `whitespace-pre-wrap` <p>, so a model
 * that (correctly) answered in Markdown produced a screenful of literal `##`, `**` and `-`
 * characters at one type size — a .txt dump in the panel that exists to show off the writing.
 * The models are not going to stop emitting Markdown, so the renderer catches up.
 *
 * Deliberately NOT a Markdown library. The output of a summarize prompt uses a tiny, stable
 * subset — headings, bullets, paragraphs, the occasional bold run — and the app already ships
 * a strict CSP and a no-`dangerouslySetInnerHTML` rule. A ~120-line hand-rolled block parser
 * that emits React elements keeps both properties (nothing is ever parsed into HTML) and adds
 * no dependency to the renderer bundle.
 *
 * What it understands, in the order it checks:
 *  - `#`…`######` ATX headings, and the bare-caps line (`KEY POINTS`) that prompts written
 *    against a plaintext panel produce — both render as the same section heading, because on
 *    screen they mean the same thing.
 *  - `-` / `*` / `•` bullets and `1.` ordered items, grouped into one list per run.
 *  - `M:SS — Topic` chapter lines, which get a tabular monospace timestamp so a chapter list
 *    reads as a column rather than as ragged prose.
 *  - `**bold**`, `*italic*` and `` `code` `` inside any of the above.
 *  - Blank-line-separated paragraphs for everything else.
 */
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A line that is entirely upper-case words — how a prompt writes a heading when it has been
 *  told the panel renders no Markdown. 2–48 chars keeps "OK." and shouted sentences out. */
const CAPS_HEADING = /^[A-Z][A-Z0-9 ,'&/()-]{1,47}$/;
const ATX_HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,2})[.)]\s+(.*)$/;
/** "0:00 — The pipeline", "12:04 - Topic", "1:02:11 – Topic". */
const CHAPTER = /^((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[—–-]\s*(.*)$/;

/** `**bold**`, `*italic*`, `` `code` `` — one pass, no nesting. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("**"))
      out.push(
        <strong key={key} className="font-semibold text-foreground">
          {tok.slice(2, -2)}
        </strong>,
      );
    else if (tok.startsWith("`"))
      out.push(
        <code
          key={key}
          className="rounded bg-foreground/[0.07] px-1 py-0.5 font-mono text-[0.92em]"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    else
      out.push(
        <em key={key} className="italic">
          {tok.slice(1, -1)}
        </em>,
      );
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "h"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "chapters"; items: Array<[string, string]> };

function parse(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  /** Appends to the open list/chapter block when the previous block is the same kind. */
  const push = (b: Block) => {
    const prev = blocks[blocks.length - 1];
    if (b.kind === "ul" && prev?.kind === "ul") prev.items.push(...b.items);
    else if (b.kind === "ol" && prev?.kind === "ol")
      prev.items.push(...b.items);
    else if (b.kind === "chapters" && prev?.kind === "chapters")
      prev.items.push(...b.items);
    else blocks.push(b);
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushPara();
      continue;
    }
    const atx = ATX_HEADING.exec(line);
    if (atx) {
      flushPara();
      blocks.push({ kind: "h", text: atx[2]!.trim() });
      continue;
    }
    const chapter = CHAPTER.exec(line.trim());
    if (chapter) {
      flushPara();
      push({ kind: "chapters", items: [[chapter[1]!, chapter[2]!.trim()]] });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      flushPara();
      push({ kind: "ul", items: [bullet[1]!.trim()] });
      continue;
    }
    const ordered = ORDERED.exec(line);
    if (ordered) {
      flushPara();
      push({ kind: "ol", items: [ordered[2]!.trim()] });
      continue;
    }
    if (para.length === 0 && CAPS_HEADING.test(line.trim())) {
      blocks.push({ kind: "h", text: line.trim() });
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return blocks;
}

/**
 * `text` is the summary exactly as the model wrote it. `className` is applied to the wrapper,
 * so the caller keeps ownership of the scroll box, the measure and the left rule.
 */
export function AiProse({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const blocks = parse(text);
  return (
    <div
      className={cn(
        "text-sm leading-relaxed text-foreground/90 [&>*+*]:mt-3",
        className,
      )}
    >
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h":
            // The one typographic step the panel takes. Same eyebrow rung the rest of the
            // app heads a section with, so an AI heading and a UI heading are the same object.
            return (
              <p
                key={i}
                className="text-[11px] font-semibold uppercase leading-none tracking-[0.08em] text-fg-subtle [&:not(:first-child)]:!mt-5"
              >
                {b.text}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="space-y-1.5">
                {b.items.map((it, k) => (
                  <li key={k} className="flex gap-2.5">
                    <span
                      aria-hidden
                      className="mt-[0.62em] h-1 w-1 flex-none rounded-full bg-accent-muted"
                    />
                    <span className="min-w-0">{inline(it, `${i}-${k}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="space-y-1.5">
                {b.items.map((it, k) => (
                  <li key={k} className="flex gap-2.5">
                    <span
                      aria-hidden
                      className="w-4 flex-none text-right font-mono text-[11px] leading-[1.75] tabular-nums text-fg-subtle"
                    >
                      {k + 1}
                    </span>
                    <span className="min-w-0">{inline(it, `${i}-${k}`)}</span>
                  </li>
                ))}
              </ol>
            );
          case "chapters":
            return (
              <ul key={i} className="space-y-1">
                {b.items.map(([at, topic], k) => (
                  <li key={k} className="flex gap-3">
                    <span className="w-12 flex-none font-mono text-[12px] tabular-nums text-accent-muted">
                      {at}
                    </span>
                    <span className="min-w-0">
                      {inline(topic, `${i}-${k}`)}
                    </span>
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={i}>
                <Fragment>{inline(b.text, String(i))}</Fragment>
              </p>
            );
        }
      })}
    </div>
  );
}
