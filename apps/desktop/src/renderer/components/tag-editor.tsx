import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { applyTagPick, tagSuggestions } from "@/lib/tag-input";
// The zero-count tone, imported rather than restated: this card's head is a Files-tab section
// head standing in the other column, and the two must not drift into two ways of dimming a "0".
// (Media detail is this component's only consumer, so the reach across is a straight line.)
import { COUNT_ZERO } from "@/routes/library/files-panel";
import { ChipDot, TagChip, tagTint } from "./tag-chip";

/** Popover geometry, in px. LIST_MAX is the old `max-h-48`; HEAD_H is the "Existing tags" strip
 * plus the two borders; GAP is the 6px offset from the field; MARGIN keeps it off the window edge. */
const LIST_MAX = 192;
const LIST_MIN = 96;
const HEAD_H = 40;
const GAP = 6;
const MARGIN = 8;

export function TagEditor({
  mediaId,
  tags,
  onChange,
}: {
  mediaId: number;
  tags: string[];
  onChange: () => void;
}) {
  const [value, setValue] = useState("");
  const [all, setAll] = useState<string[]>([]);
  // Presentation only. The native <datalist> this replaces closed itself when the field
  // lost focus; a styled popover has to be told, or it hangs over the panel below it.
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    window.sift.tags.listAll().then((rows) => setAll(rows.map((r) => r.name)));
  }, [tags]);

  async function commit(raw: string) {
    const names = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const n of names) await window.sift.tags.add(mediaId, n);
    setValue("");
    onChange();
  }

  async function remove(name: string) {
    await window.sift.tags.remove(mediaId, name);
    onChange();
  }

  // Follows the term after the last comma, not the whole field — the box takes several tags at
  // once, so "systems, sq" is a user writing "sq". See lib/tag-input.ts.
  const suggestions = tagSuggestions(value, all, tags);

  const open = focused && suggestions.length > 0;

  /* Which side the popover opens on, and how tall its list may be.
   *
   * This card is the last thing in media detail's left column, so the field sits ~50px above the
   * bottom of the window. Opening downward unconditionally put the popover at 853→1081 in a
   * 900px window, and `main` (lg:overflow-hidden), the route scroller and the app shell all clip
   * at the window edge — so it was cut off, not merely below the fold.
   *
   * Measured in useLayoutEffect (before paint) so the popover never shows on the wrong side
   * first. The list is also clamped to the room actually available, so the short-window case
   * degrades to a scrollable list instead of a clipped one. */
  const fieldRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ up: false, maxH: LIST_MAX });

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = fieldRef.current;
      if (!el) return;
      const { top, bottom } = el.getBoundingClientRect();
      const below = window.innerHeight - bottom - GAP - MARGIN;
      const above = top - GAP - MARGIN;
      const up = below < LIST_MAX + HEAD_H && above > below;
      const room = (up ? above : below) - HEAD_H;
      setPlace({ up, maxH: Math.max(LIST_MIN, Math.min(LIST_MAX, room)) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, suggestions.length]);

  return (
    <div data-testid="tag-editor" className="flex flex-col gap-2.5">
      {/* Micro-header, not an accent moment: the page already spends its one coral eyebrow
          at the top of the route, so a sub-section label inside a panel stays monochrome.
          **Label · count · rule, in that order** — the same head DOCUMENTS / TRANSCRIPTS /
          SUMMARIES / DOWNLOADS render one column across. This head used to park its count at
          the far end of a rule that faded to transparent 380px earlier, so the number floated
          alone in empty card with nothing tying it to the word it counts, in an encoding
          nothing else on the page used. The count sits next to the thing it counts; the
          hairline is flat and runs to the edge; a zero is dimmed, not hidden, so the head
          keeps one shape whether or not there are tags. */}
      <div className="flex items-center gap-2.5">
        <p className="eyebrow text-muted-foreground">Tags</p>
        <Badge
          variant="count"
          className={tags.length > 0 ? "flex-none" : `flex-none ${COUNT_ZERO}`}
        >
          {tags.length}
        </Badge>
        <span aria-hidden className="h-px flex-1 bg-white/[0.06]" />
      </div>

      {/* **The chips sit on the card, not in a box.** They used to live in a bordered, filled
          well whose chrome was indistinguishable from the "Add tags" input 9px below it: two
          adjacent rounded rectangles with the same hairline and the same fill, one inert and
          one typable, and nothing in the styling said which was which. The well was also
          earning nothing — pills already read as a group against a flat surface. Dropping it
          leaves exactly one bordered box inside this card, and it is the one you can type in.
          A `min-h` still reserves the row so the card doesn't collapse on its last tag being
          removed, and `content-center` keeps a single row optically centred in it.
          The empty state keeps its box, because a *dashed* outline reads as a placeholder for
          content rather than as a second panel. */}
      {tags.length > 0 ? (
        <div className="flex min-h-[2.75rem] flex-wrap content-center items-center gap-1.5">
          {tags.map((t) => (
            <TagChip key={t} name={t} onRemove={() => remove(t)} />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[3.25rem] items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-surface-2 text-foreground/35">
            <Tag aria-hidden className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-foreground/85">No tags yet.</span>
            <span className="mt-0.5 block text-[11.5px] leading-4 text-muted-foreground">
              Tagged videos can be filtered in the Library.
            </span>
          </span>
        </div>
      )}

      <div
        ref={fieldRef}
        className="relative"
        // Capture phase so focus moving between the field and an option inside the popover
        // keeps it open, while leaving the group entirely closes it.
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
        }}
      >
        <Tag
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40"
        />
        <Input
          data-testid="tag-input"
          className="pl-9 text-[13px]"
          placeholder="Add tags (comma-separated)…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              e.preventDefault();
              commit(value);
            }
          }}
        />

        {open && (
          <div
            data-testid="tag-suggestions"
            className={cn(
              "absolute left-0 right-0 z-30 overflow-hidden",
              place.up ? "bottom-[calc(100%_+_6px)]" : "top-[calc(100%_+_6px)]",
              "rounded-xl border border-border bg-surface-2 shadow-pop",
              "animate-in fade-in-0 zoom-in-95 duration-100 motion-reduce:animate-none",
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-foreground/[0.03] px-3 py-2">
              <p className="eyebrow text-muted-foreground">Existing tags</p>
              <span className="text-[11px] font-medium tabular-nums text-foreground/40">
                {suggestions.length}
              </span>
            </div>
            <ul className="scroll-thin overflow-y-auto p-1" style={{ maxHeight: place.maxH }}>
              {suggestions.map((s, i) => {
                const tint = tagTint(s);
                return (
                  <li key={s}>
                    <button
                      type="button"
                      // preventDefault keeps focus in the field, so the popover survives the
                      // click and the picked name lands ready to commit with Enter — exactly
                      // what selecting from the old <datalist> did.
                      onMouseDown={(e) => e.preventDefault()}
                      // Replaces the term being typed, not the field: picking "sqlite" out of
                      // "systems, sq" must not throw away "systems".
                      onClick={() => setValue(applyTagPick(value, s))}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px]",
                        "text-muted-foreground transition-colors duration-150 ease-out",
                        "hover:bg-foreground/[0.07] hover:text-foreground motion-reduce:transition-none",
                        // The best match reads as pre-highlighted rather than the list
                        // opening with every row identical.
                        i === 0 && "bg-foreground/[0.06] text-foreground",
                      )}
                    >
                      {/* Same 6px semantic dot the chip leads with, so a suggestion and
                          the chip it becomes are visibly the same object. */}
                      <ChipDot color={tint.text} halo={tint.fill} />
                      <span className="truncate">{s}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
