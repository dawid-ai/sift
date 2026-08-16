import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 500;

/**
 * Debounces `value`; fires `onUrl` with the trimmed value `delay` ms after the
 * last change. When `value` is blank, fires `onUrl("")` immediately (no
 * debounce) so callers can clear any stale preview/error state. Cancels the
 * pending timer on every re-run (change of `value`, `delay`, or `onUrl`) and
 * on unmount.
 */
function useDebouncedUrl(value: string, delay: number, onUrl: (url: string) => void) {
  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      onUrl("");
      return;
    }
    const timer = setTimeout(() => onUrl(trimmed), delay);
    return () => clearTimeout(timer);
  }, [value, delay, onUrl]);
}

/**
 * The empty state's payload. Purely presentational, and deliberately not a feature list:
 * these are the three link *shapes* the field already accepts, named in the same words the
 * page's own hint uses ("a video, playlist, or channel URL"). Nothing here claims a
 * capability the app doesn't have, and nothing here is interactive.
 *
 * The example is monospace because it is a literal URL shape you could paste; the label
 * above it is not, which is the one rule mono follows on this route. There is no ranked
 * numeral: these three are alternatives, not steps, so a rank would be inventing an order
 * the user can't act on — and it would put a third type treatment in a 230px card.
 *
 * Each example is written **trailing**, host first, rather than as `…/watch?v=`. Leading with
 * a truncation ellipsis and stopping on a bare `=` reads as a string that got clipped by the
 * layout; a whole host-and-path fragment reads as the shape it is meant to demonstrate.
 */
const PASTE_KINDS: ReadonlyArray<{ title: string; example: string }> = [
  { title: "Video", example: "youtube.com/watch?v=ID" },
  { title: "Playlist", example: "youtube.com/playlist?list=ID" },
  { title: "Channel", example: "youtube.com/@handle" },
];

export interface UrlInputProps {
  /** Called with the trimmed URL after the debounce window elapses, or "" immediately when input is cleared. */
  onUrl: (url: string) => void;
  debounceMs?: number;
}

export function UrlInput({ onUrl, debounceMs = DEBOUNCE_MS }: UrlInputProps) {
  const [value, setValue] = useState("");
  useDebouncedUrl(value, debounceMs, onUrl);

  const empty = value.trim() === "";

  return (
    <div className="flex w-full flex-col">
      {/* The hero control: one tall bar carrying a tinted link chip and the field itself.
          The shell owns the border/focus ring so the <input> can sit flush inside it — the
          field is never a naked box floating on the panel. The fill is a step *down* from the
          panel it sits in, so it reads as a well, not another card.

          Nothing trails the field. A chip echoing the host of what you just typed
          ("youtube.com") restated a fact the URL itself spells out and the preview card's
          platform pill states again 140px lower — three prints of one fact in one viewport. */}
      <div
        className={[
          // #0C0A09 is the route's one recessed value — the same fill the preview card's
          // spec strip, thumbnail slate and reading wells use.
          "flex w-full items-center gap-2.5 rounded-2xl border border-foreground/[0.09] bg-[#0C0A09] p-1.5 pl-2.5 pr-3.5",
          "shadow-[inset_0_1px_0_0_hsla(0,0%,100%,0.05),inset_0_2px_12px_0_hsla(0,0%,0%,0.5)]",
          "transition-colors duration-150 ease-out hover:border-foreground/[0.16]",
          // ONE ring, a single hairline. The panel around this field never picks up a second
          // accent border on focus — two concentric amber rings make the whole card look
          // selected instead of the field.
          "focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/40",
        ].join(" ")}
      >
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/12 text-primary shadow-[inset_0_1px_0_0_hsla(0,0%,100%,0.10)]"
        >
          <Link2 className="h-[18px] w-[18px]" />
        </span>

        <Input
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          // The instruction, stated once, where the action happens. Nothing below this field
          // may restate it — an instruction printed twice in one card reads as a draft.
          placeholder="Paste a video, playlist or channel URL…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          data-testid="url-input"
          className="h-11 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-1 text-[15px] hover:border-0 focus:bg-transparent focus:ring-0"
        />
      </div>

      {/* Empty-state payload. An empty Home is still a designed surface: rather than leaving
          the panel as a bare bar over a void, the three link shapes the field accepts are
          named under the field. They fall away the moment anything is typed, so the filled
          states stay uncluttered.

          They are **plain text**, not slots. Each used to wear a border, a fill and a top
          bevel — `border-foreground/[0.07] bg-foreground/[0.03]` plus an inset white line, a
          dimmed copy of the preview card's own control shell at the same 12px radius. Three
          bordered, bevelled, filled boxes side by side in a card whose only other elements are
          a real input and a real link do not read as examples; they read as three buttons that
          don't respond. Nothing here is interactive, so nothing here wears a control's costume.

          The rule is pulled full-bleed with `-mx-6 px-6` — the section's own padding, undone
          for the border and put back for the content — so it terminates on the card edge like
          every band rule on the preview card below it, instead of stopping 24px short. */}
      {empty && (
        <div className="-mx-6 mt-4 border-t border-foreground/[0.07] px-6 pt-4">
          <p className="eyebrow">LINK FORMATS</p>
          {/* `gap-y-4` is the stacked-layout number: below `sm` these three sit in one column,
              and a row gap has to be visibly larger than the 8px inside each title/example
              pair or the six lines read as one list instead of three. */}
          <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-3">
            {PASTE_KINDS.map((kind) => (
              <div key={kind.title} className="min-w-0">
                <p className="text-[13px] font-semibold leading-none text-fg-secondary">
                  {kind.title}
                </p>
                {/* The half that carries the information, so it is set to be read: 12px on
                    `--muted-foreground`, the token this palette reserves for body copy and
                    captions (6.1:1 on the card fill). */}
                <p className="mt-2 truncate font-mono text-[12px] leading-none text-muted-foreground">
                  {kind.example}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
