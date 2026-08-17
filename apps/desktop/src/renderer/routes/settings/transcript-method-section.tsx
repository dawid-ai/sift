import { useEffect, useState } from "react";
import type { TranscriptMethod } from "@sift/ipc-contract";
import { cn } from "@/lib/utils";
import { NESTED_SURFACE, ROW_LIST, SettingsError } from "./settings-page";

const METHODS: {
  value: TranscriptMethod;
  label: string;
  description: string;
}[] = [
  {
    value: "auto",
    label: "Auto",
    description: "Use captions if available, Whisper if none.",
  },
  {
    value: "prefer_whisper",
    label: "Prefer Whisper",
    description:
      "Use local Whisper when the video is downloaded, else captions.",
  },
  {
    value: "captions_only",
    label: "Captions only",
    description: "Never use Whisper.",
  },
];

/** Default transcript method used by transcript.get. Loads on mount, persists on every change. */
export function TranscriptMethodSection() {
  const [method, setMethod] = useState<TranscriptMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.sift.transcript
      .getMethod()
      .then(setMethod)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function persist(next: TranscriptMethod) {
    setMethod(next);
    setError(null);
    try {
      await window.sift.transcript.setMethod(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="transcript-method-section"
    >
      {/* One nested block, rows separated by a hairline — not three bordered cards stacked
          inside an already-bordered section card. */}
      <div className={cn(NESTED_SURFACE, "overflow-hidden", ROW_LIST)}>
        {METHODS.map((m) => {
          const selected = method === m.value;
          return (
            <label
              key={m.value}
              data-testid={`transcript-method-option-${m.value}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 px-4 py-3.5 text-sm",
                "transition-colors duration-150 ease-out",
                selected ? "bg-[hsl(24_60%_14%)]" : "hover:bg-white/[0.03]",
              )}
            >
              {/* Native radio, restyled: Chromium's default paints a light-grey disc that
                  disappears on this surface. appearance-none + an inset ring gives the dot. */}
              <input
                type="radio"
                name="transcript-method"
                value={m.value}
                checked={selected}
                onChange={() => void persist(m.value)}
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-full border",
                  "border-white/20 bg-white/[0.06] transition-colors duration-150",
                  "checked:border-primary checked:bg-primary",
                  "checked:shadow-[inset_0_0_0_3px_hsl(24_60%_14%)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                  "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    "font-medium",
                    selected ? "text-[hsl(24_95%_78%)]" : "text-foreground/85",
                  )}
                >
                  {m.label}
                </span>
                <span className="mt-1 block max-w-[62ch] text-[12px] leading-relaxed text-foreground/60">
                  {m.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {error && <SettingsError>{error}</SettingsError>}
    </div>
  );
}
