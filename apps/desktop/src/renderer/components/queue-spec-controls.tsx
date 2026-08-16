import { useEffect, useState, type ReactNode } from "react";
import { Captions, Check, ChevronDown, Sparkles } from "lucide-react";
import type { QueueSpec } from "@sift/ipc-contract";
import { FIELD } from "@/routes/settings/settings-page";
import { useAiPickers } from "@/lib/use-ai-pickers";

const MAXRES = [
  { label: "Best available", value: "" },
  { label: "Max 2160p", value: "2160" },
  { label: "Max 1440p", value: "1440" },
  { label: "Max 1080p", value: "1080" },
  { label: "Max 720p", value: "720" },
  { label: "Max 480p", value: "480" },
];

/* Every control in the row is 40px tall, but only the *fields* (select, text input) wear the
   field shell — 12px radius, hairline, filled. Toggles are pills, not fields: same height,
   fully round, no box around a checkbox pretending to be a dropdown. One height, three
   honestly different shapes. */
const SHAPE = "h-10 w-full rounded-xl border text-sm transition-colors";
/* The field skin is the app's shared `FIELD`, not a route-local re-roll of it: a well cut
   into the card (recessed fill, hairline at rest, amber focus wash) and the `--placeholder`
   token, which is now literally the same string the Channels URL field and every field on
   Settings render. Recessed is also the right direction — in the reference frames a field you
   type into is DARKER than the panel holding it, while a control you press is lighter, which
   is exactly the split this file draws between its fields and its toggles below. */
const SKIN = `${FIELD} text-foreground`;
const CONTROL_FOCUS = "focus:outline-none";

/* A native <select> keeps every behavior (including Playwright's selectOption), but its
   default Chromium arrow is a grey wedge that reads as unstyled. `appearance-none` plus an
   inert chevron gives the same control the app's own chrome. */
/* Disabled is a colour, not a multiplier. `opacity-45` on a field whose ink is already
   `--foreground` produced an undocumented grey that belonged to no rung — the same bug
   ui/button.tsx spells out at length — so the dead state uses `--fg-disabled`, the token the
   palette reasoned out for exactly this. */
const SELECT = `${SHAPE} ${SKIN} ${CONTROL_FOCUS} appearance-none pl-3 pr-9 disabled:cursor-not-allowed disabled:text-fg-disabled`;

/** A small caption above a control. `.field-label` is the rung globals.css documents for
 * exactly this — 11px/600 uppercase, 0.08em, `--muted-foreground` — the brighter of the two
 * micro-label rungs, because a live control's name is not decoration and must not read like
 * the `.eyebrow` that heads the card above it.
 *
 * It is the class, not a hand-rolled copy of the class: this row spelling out its own
 * `text-[11px] … tracking-[0.08em] text-muted-foreground` is precisely how the ladder drifted
 * the first time — the moment one call site re-declares a rung, the rung has two definitions
 * and only one of them moves when the system does. Only the 8px gap is local, because that
 * belongs to the layout, not to the type. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="field-label mb-2">{label}</span>
      {children}
    </div>
  );
}

function SelectShell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`relative ${className ?? ""}`}>
      {children}
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40"
      />
    </div>
  );
}

/** An op toggle is a pill, not a field: it sizes to its own label instead of stretching to a
 * grid cell, and the fill *is* the state — no checkbox square, no dead space to its right.
 *
 * The real `<input type=checkbox>` is still the whole hit area: `appearance-none` turns it
 * into the pill's own background and border, and the icon+label sit on top as an inert
 * (`pointer-events-none`) layer, so `elementFromPoint` at the pill's centre still resolves to
 * the input. Keyboard focus, `.check()` and screen readers all keep working. */
function OpToggle({
  label,
  icon,
  checked,
  testId,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  checked: boolean;
  testId: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="relative inline-flex h-10 flex-none cursor-pointer select-none items-center">
      <input
        data-testid={testId}
        type="checkbox"
        className={`absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          checked
            ? "border-ai/45 bg-ai/[0.14] shadow-[inset_0_1px_0_0_hsl(var(--ai)/0.25)] focus-visible:ring-ai/60"
            : "border-border bg-surface-2/70 hover:border-border-strong focus-visible:ring-primary/60"
        }`}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={`pointer-events-none relative flex items-center gap-2 whitespace-nowrap px-3.5 text-[13px] font-medium transition-colors ${
          checked ? "text-ai" : "text-muted-foreground"
        }`}
      >
        <span aria-hidden className="flex flex-none">
          {icon}
        </span>
        {label}
        <Check
          aria-hidden
          strokeWidth={3}
          className={`h-3.5 w-3.5 flex-none transition-opacity ${checked ? "opacity-100" : "opacity-0"}`}
        />
      </span>
    </label>
  );
}

/** The format-preference + op-toggle controls shared by the Queue page and Channel detail.
 * Calls `onChange` with the current QueueSpec whenever a control changes. */
export function QueueSpecControls({ onChange }: { onChange: (spec: QueueSpec) => void }) {
  const [formatKind, setFormatKind] = useState<"best" | "audio">("best");
  const [maxRes, setMaxRes] = useState("");
  const [wantTranscript, setWantTranscript] = useState(false);
  const [wantSummarize, setWantSummarize] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const ai = useAiPickers();

  useEffect(() => {
    window.sift.tags.listAll().then((rows) => setAllTags(rows.map((r) => r.name)));
  }, []);

  // Tag suggestions: existing tags matching the text after the last comma, minus ones already typed.
  const enteredTags = tagsInput.split(",").map((s) => s.trim()).filter(Boolean);
  const lastToken = tagsInput.slice(tagsInput.lastIndexOf(",") + 1).trim();
  // Display-only: everything before the final comma is "committed" and renders as a chip, so
  // the token you're still typing stays in the caret's line instead of doubling up as a chip.
  const commaAt = tagsInput.lastIndexOf(",");
  const committedTags =
    commaAt >= 0 ? tagsInput.slice(0, commaAt).split(",").map((s) => s.trim()).filter(Boolean) : [];
  const tagSuggestions = lastToken
    ? allTags
        .filter((n) => n.toLowerCase().includes(lastToken.toLowerCase()) && !enteredTags.some((t) => t.toLowerCase() === n.toLowerCase()))
        .slice(0, 6)
    : [];
  function pickTag(name: string) {
    const cut = tagsInput.lastIndexOf(",");
    const prefix = cut >= 0 ? `${tagsInput.slice(0, cut + 1)} ` : "";
    setTagsInput(`${prefix}${name}, `);
  }

  useEffect(() => {
    const summarize: QueueSpec["summarize"] =
      wantSummarize && ai.selectedProviderId && ai.selectedModel && ai.selectedPromptId !== ""
        ? { providerId: ai.selectedProviderId, model: ai.selectedModel, promptId: Number(ai.selectedPromptId) }
        : null;
    const tags = tagsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    onChange({
      format: { kind: formatKind === "audio" ? "audio" : "video", maxHeight: maxRes ? Number(maxRes) : null, mp4: true },
      download: true,
      transcript: wantTranscript,
      summarize,
      tags,
    });
  }, [formatKind, maxRes, wantTranscript, wantSummarize, tagsInput, ai.selectedProviderId, ai.selectedModel, ai.selectedPromptId, onChange]);

  return (
    <div className="flex flex-col gap-4">
      {/* Four semantic groups, not five identical cells: two fields that need width, one pair
          of pill toggles that needs none, and a tag field that gets the remainder. Columns are
          sized to their contents so a 16px choice never occupies a 185px dropdown-shaped box. */}
      <div className="grid grid-cols-1 items-start gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_minmax(0,1.15fr)]">
        <Field label="Format">
          <SelectShell>
            <select
              data-testid="queue-format"
              className={SELECT}
              value={formatKind}
              onChange={(e) => setFormatKind(e.target.value as "best" | "audio")}
            >
              <option value="best">Video &amp; Audio</option>
              <option value="audio">Audio only</option>
            </select>
          </SelectShell>
        </Field>
        <Field label="Quality">
          <SelectShell>
            <select
              data-testid="queue-maxres"
              className={SELECT}
              value={maxRes}
              onChange={(e) => setMaxRes(e.target.value)}
              disabled={formatKind === "audio"}
            >
              {MAXRES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </SelectShell>
        </Field>
        {/* One label owns both toggles — they answer the same question ("what else runs on
            each item?"), so they're grouped rather than captioned twice. */}
        <Field label="Also run">
          <div className="flex flex-wrap items-center gap-2">
            <OpToggle
              label="Transcribe"
              testId="queue-op-transcript"
              icon={<Captions className="h-3.5 w-3.5" />}
              checked={wantTranscript}
              onChange={setWantTranscript}
            />
            <OpToggle
              label="Summarize"
              testId="queue-op-summarize"
              icon={<Sparkles className="h-3.5 w-3.5" />}
              checked={wantSummarize}
              onChange={setWantSummarize}
            />
          </div>
        </Field>
        <Field label="Add tags">
          <div className="flex min-w-0 flex-col gap-2">
            {/* The placeholder shows the syntax the field actually parses (it splits on
                commas). It used to read "Add tags" under a label reading ADD TAGS, 22px apart
                — the one field in this row whose placeholder carried no information while its
                three siblings all showed their real value. Colour is the `--placeholder`
                token, the documented 5.0:1 floor for instructional field text, not a fraction
                of another grey. */}
            <input
              data-testid="queue-tags"
              className={`${SHAPE} ${SKIN} ${CONTROL_FOCUS} px-3.5`}
              type="text"
              placeholder="research, ml, watch-later"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
            {/* Committed tags read back as tokens, so the field stops looking like a raw text
                box and the comma-separated value gets a visible shape. */}
            {committedTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {committedTags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex h-6 max-w-full items-center truncate rounded-md border border-foreground/10 bg-foreground/[0.06] px-2 text-[12px] font-medium leading-none text-foreground/80"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            {tagSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tagSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    data-testid="queue-tag-suggestion"
                    onClick={() => pickTag(s)}
                    className="inline-flex h-6 items-center rounded-md border border-dashed border-foreground/15 px-2 text-[12px] font-medium leading-none text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/12 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>
      </div>

      {wantSummarize && (
        <div className="rounded-xl border border-ai/20 bg-ai/[0.05] px-4 py-3.5">
          {/* Same rung as the labels on the three controls it opens, taken from the class
              rather than re-declared — only the hue is local, because this group is the AI
              one. A second copy of the rung's spec in the same file is how it drifts. */}
          <p className="field-label text-ai/90">Summary run</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Provider">
              <SelectShell>
                <select className={SELECT} value={ai.selectedProviderId} onChange={(e) => ai.setSelectedProviderId(e.target.value)}>
                  {ai.providers.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                </select>
              </SelectShell>
            </Field>
            <Field label="Model">
              <SelectShell>
                <select className={SELECT} value={ai.selectedModel} onChange={(e) => ai.setSelectedModel(e.target.value)}>
                  {ai.models.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
                </select>
              </SelectShell>
            </Field>
            <Field label="Prompt">
              <SelectShell>
                <select className={SELECT} value={ai.selectedPromptId} onChange={(e) => ai.setSelectedPromptId(e.target.value === "" ? "" : Number(e.target.value))}>
                  {ai.prompts.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </SelectShell>
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}
