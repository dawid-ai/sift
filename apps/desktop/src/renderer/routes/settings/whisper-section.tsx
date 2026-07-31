import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { WhisperProgress, WhisperStatus } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EMPTY: WhisperStatus = {
  binaryInstalled: false,
  binaryPath: null,
  modelInstalled: false,
  modelPath: null,
};

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
    <Card data-testid="binary-whisper">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Whisper (local transcription)</CardTitle>
        {ready && <Badge>Installed</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p data-testid="binary-whisper-status" className="text-sm text-foreground/70">
          {ready
            ? "Ready — used when a downloaded video has no captions."
            : `Binary ${status.binaryInstalled ? "✓" : "✗"} · Model ${status.modelInstalled ? "✓" : "✗"} (~466 MB)`}
        </p>

        {error && (
          <p data-testid="binary-whisper-error" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <AnimatePresence>
          {installing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-col gap-1"
            >
              <span className="text-xs text-foreground/60">
                {progress?.stage === "model" ? "Downloading model…" : "Downloading binary…"}
              </span>
              <div className="h-2 overflow-hidden rounded-full bg-border">
                {percent !== null ? (
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    animate={{ width: `${percent}%` }}
                    transition={{ ease: "easeOut" }}
                  />
                ) : (
                  <motion.div
                    className="h-full w-1/3 rounded-full bg-primary"
                    animate={{ x: ["-100%", "300%"] }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!ready && (
          <div>
            <Button
              size="sm"
              disabled={installing}
              data-testid="binary-whisper-install"
              onClick={() => void handleInstall()}
            >
              {installing ? "Installing…" : "Install"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
