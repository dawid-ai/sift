import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BinaryKind, BinaryProgress, BinaryStatus } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const BINARY_KINDS: BinaryKind[] = ["ytdlp", "ffmpeg", "deno"];

const KIND_LABELS: Record<BinaryKind, string> = {
  ytdlp: "yt-dlp",
  ffmpeg: "ffmpeg",
  deno: "Deno (YouTube JS runtime)",
};

function emptyStatus(kind: BinaryKind): BinaryStatus {
  return {
    kind,
    installed: false,
    installedVersion: null,
    latestVersion: null,
    updateAvailable: false,
    path: null,
  };
}

export function BinariesSection() {
  const [statuses, setStatuses] = useState<Record<BinaryKind, BinaryStatus>>({
    ytdlp: emptyStatus("ytdlp"),
    ffmpeg: emptyStatus("ffmpeg"),
    deno: emptyStatus("deno"),
  });
  const [progress, setProgress] = useState<Partial<Record<BinaryKind, BinaryProgress>>>({});
  const [busy, setBusy] = useState<Partial<Record<BinaryKind, "checking" | "installing">>>({});
  const [errors, setErrors] = useState<Partial<Record<BinaryKind, string | null>>>({});
  const [policy, setPolicy] = useState<"auto" | "notify">("auto");
  useEffect(() => {
    window.sift.binaries.getPolicy().then(setPolicy);
  }, []);
  async function togglePolicy(next: "auto" | "notify") {
    setPolicy(next);
    await window.sift.binaries.setPolicy(next);
  }

  useEffect(() => {
    let cancelled = false;
    window.sift.binaries.list().then((list) => {
      if (cancelled) return;
      setStatuses((prev) => {
        const next = { ...prev };
        for (const status of list) next[status.kind] = status;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.sift.binaries.onProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.kind]: p }));
    });
    return unsubscribe;
  }, []);

  async function handleCheck(kind: BinaryKind) {
    setBusy((prev) => ({ ...prev, [kind]: "checking" }));
    setErrors((prev) => ({ ...prev, [kind]: null }));
    try {
      const status = await window.sift.binaries.check(kind);
      setStatuses((prev) => ({ ...prev, [kind]: status }));
    } catch (e) {
      setErrors((prev) => ({ ...prev, [kind]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy((prev) => ({ ...prev, [kind]: undefined }));
    }
  }

  async function handleInstall(kind: BinaryKind) {
    setBusy((prev) => ({ ...prev, [kind]: "installing" }));
    setErrors((prev) => ({ ...prev, [kind]: null }));
    try {
      const status = await window.sift.binaries.install(kind);
      setStatuses((prev) => ({ ...prev, [kind]: status }));
    } catch (e) {
      setErrors((prev) => ({ ...prev, [kind]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy((prev) => ({ ...prev, [kind]: undefined }));
      setProgress((prev) => ({ ...prev, [kind]: undefined }));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm text-foreground/80" data-testid="binary-autoupdate-toggle">
        <input
          type="checkbox"
          checked={policy === "auto"}
          onChange={(e) => void togglePolicy(e.target.checked ? "auto" : "notify")}
        />
        Keep tools up to date automatically
      </label>
      {BINARY_KINDS.map((kind) => {
        const status = statuses[kind];
        const kindProgress = progress[kind];
        const isBusy = busy[kind] !== undefined;
        const isInstalling = busy[kind] === "installing";
        const percent =
          kindProgress && kindProgress.total
            ? Math.min(100, Math.round((kindProgress.received / kindProgress.total) * 100))
            : null;

        return (
          <Card key={kind} data-testid={`binary-${kind}`}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{KIND_LABELS[kind]}</CardTitle>
              {status.updateAvailable && <Badge>Update available</Badge>}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1 text-sm text-foreground/70">
                <p data-testid={`binary-${kind}-version`}>
                  {status.installed && status.installedVersion
                    ? `Installed: ${status.installedVersion}`
                    : "Not installed"}
                </p>
                {status.latestVersion && <p>Latest: {status.latestVersion}</p>}
              </div>

              {errors[kind] && (
                <p
                  data-testid={`binary-${kind}-error`}
                  className="text-sm text-red-600 dark:text-red-400"
                >
                  {errors[kind]}
                </p>
              )}

              <AnimatePresence>
                {isInstalling && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="h-2 overflow-hidden rounded-full bg-border"
                  >
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
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex gap-2">
                {!status.installed && (
                  <Button
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void handleInstall(kind)}
                  >
                    {isInstalling ? "Installing…" : "Install"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => void handleCheck(kind)}
                >
                  {busy[kind] === "checking" ? "Checking…" : "Check"}
                </Button>
                {status.installed && status.updateAvailable && (
                  <Button
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void handleInstall(kind)}
                  >
                    {isInstalling ? "Updating…" : "Update"}
                  </Button>
                )}
                {status.installed && !status.updateAvailable && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isBusy}
                    data-testid={`binary-${kind}-reinstall`}
                    onClick={() => void handleInstall(kind)}
                  >
                    {isInstalling ? "Reinstalling…" : "Reinstall"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
