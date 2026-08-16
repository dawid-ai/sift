import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, Minus } from "lucide-react";
import type { WhisperProgress, WhisperStatus } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MicroLabel, NESTED_SURFACE, SettingsError } from "./settings-page";

const EMPTY: WhisperStatus = {
  binaryInstalled: false,
  binaryPath: null,
  modelInstalled: false,
  modelPath: null,
};

/** One half of "what's on disk". This used to be a literal `✓` / `✗` inside the status
 * sentence, and Chromium resolves neither from Inter: the ✗ landed as a serif capital X in
 * the middle of a line of body copy — "Binary X · Model X" — which is the single loudest
 * unfinished tell on the Transcription tab. Same two facts, drawn with the icon vocabulary
 * every other card on this page already uses. The mark is decorative and the state is spelled
 * out for assistive tech, so nothing here is carried by hue or shape alone. */
function PartState({ label, done }: { label: string; done: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={done ? "text-success" : "text-foreground/45"}>
        {done ? <Check className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
      </span>
      <span className="text-foreground/85">{label}</span>
      {/* "downloaded", never "installed": whisper.spec.ts resolves `getByText("Installed")`
          inside this card and Playwright's text engine matches substrings, so a hidden
          "not installed" here would make that locator ambiguous. */}
      <span className="sr-only">{done ? "downloaded" : "not downloaded"}</span>
    </span>
  );
}

export function WhisperSection() {
  const [status, setStatus] = useState<WhisperStatus>(EMPTY);
  const [progress, setProgress] = useState<WhisperProgress | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.sift.whisper.status().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => window.sift.whisper.onProgress(setProgress), []);

  const ready = status.binaryInstalled && status.modelInstalled;

  async function handleInstall() {
    setInstalling(true);
    setError(null);
    try {
      setStatus(await window.sift.whisper.install());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
      setProgress(null);
    }
  }

  const percent =
    progress && progress.total
      ? Math.min(100, Math.round((progress.received / progress.total) * 100))
      : null;

  return (
    <div
      data-testid="binary-whisper"
      className={cn(NESTED_SURFACE, "flex flex-col gap-3 p-4")}
    >
      <div className="flex items-start justify-between gap-4">
        {ready ? (
          <p
            data-testid="binary-whisper-status"
            className="min-w-0 max-w-[62ch] text-sm leading-relaxed text-foreground/60 [text-wrap:pretty]"
          >
            Ready — used when a downloaded video has no captions.
          </p>
        ) : (
          <p
            data-testid="binary-whisper-status"
            className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-sm leading-relaxed text-foreground/60"
          >
            <PartState label="Binary" done={status.binaryInstalled} />
            <PartState label="Model" done={status.modelInstalled} />
            <span className="tabular-nums">(~466 MB)</span>
          </p>
        )}
        {/* Careful: whisper.spec.ts asserts a single "Installed" match inside this card —
            the not-ready badge must not contain that word. */}
        {ready ? (
          <Badge variant="success">Installed</Badge>
        ) : (
          <Badge variant="warning">Setup needed</Badge>
        )}
      </div>

      {error && <SettingsError data-testid="binary-whisper-error">{error}</SettingsError>}

      <AnimatePresence>
        {installing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-1.5"
          >
            <MicroLabel>
              {progress?.stage === "model" ? "Downloading model…" : "Downloading binary…"}
            </MicroLabel>
            <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
              {percent !== null ? (
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary-lit"
                  animate={{ width: `${percent}%` }}
                  transition={{ ease: "easeOut" }}
                />
              ) : (
                <motion.div
                  className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary to-primary-lit"
                  animate={{ x: ["-100%", "300%"] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!ready && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={installing}
            data-testid="binary-whisper-install"
            onClick={() => void handleInstall()}
          >
            <Download className="h-3.5 w-3.5" />
            {installing ? "Installing…" : "Install"}
          </Button>
          <span className="text-[12px] text-foreground/60">
            One-time download, then it runs offline.
          </span>
        </div>
      )}
    </div>
  );
}
