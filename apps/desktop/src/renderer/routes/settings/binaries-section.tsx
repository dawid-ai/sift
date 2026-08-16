import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Film, Terminal } from "lucide-react";
import type { ComponentType } from "react";
import type { BinaryKind, BinaryProgress, BinaryStatus } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  CountTag,
  FULL_BLEED_SM,
  GroupLabel,
  NESTED_SURFACE,
  SECTION_RULE,
  SettingRow,
  SettingsError,
} from "./settings-page";

const BINARY_KINDS: BinaryKind[] = ["ytdlp", "ffmpeg", "deno"];

const KIND_LABELS: Record<BinaryKind, string> = {
  ytdlp: "yt-dlp",
  ffmpeg: "ffmpeg",
  deno: "Deno (YouTube JS runtime)",
};

const KIND_ICONS: Record<BinaryKind, ComponentType<{ className?: string }>> = {
  ytdlp: Download,
  ffmpeg: Film,
  deno: Terminal,
};

// What each tool is for. Plain statements of existing behaviour — no new capability implied.
const KIND_ROLES: Record<BinaryKind, string> = {
  ytdlp: "Fetches metadata and downloads media.",
  ffmpeg: "Merges streams, extracts audio and frames.",
  deno: "Runs YouTube's player JS when a download needs it.",
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
    let cancelled = false;
    window.sift.binaries.getPolicy().then((p) => {
      if (!cancelled) setPolicy(p);
    });
    return () => {
      cancelled = true;
    };
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

  const installedCount = BINARY_KINDS.filter((kind) => statuses[kind].installed).length;

  return (
    <div className="flex flex-col gap-5">
      <SettingRow
        label="Keep tools up to date automatically"
        hint="On: new versions install in the background. Off: you get a notification and update from here."
      >
        <Switch
          data-testid="binary-autoupdate-toggle"
          aria-label="Keep tools up to date automatically"
          checked={policy === "auto"}
          onChange={(next) => void togglePolicy(next ? "auto" : "notify")}
        />
      </SettingRow>

      <div className="flex flex-col gap-2">
        {/* Count the STATE, not the array. "Installed tools 3" sat directly above three rows
            that all read "Not installed" — the loudest small object on the card carrying the
            one number on it that was false. The label names the group, the tag reports how
            many of them are actually here, and "0/3" is honest at a glance. */}
        <div className="mb-1 flex items-center">
          <GroupLabel>Tools</GroupLabel>
          <CountTag>{`${installedCount}/${BINARY_KINDS.length}`}</CountTag>
        </div>
        {BINARY_KINDS.map((kind) => {
          const status = statuses[kind];
          const kindProgress = progress[kind];
          const isBusy = busy[kind] !== undefined;
          const isInstalling = busy[kind] === "installing";
          const Icon = KIND_ICONS[kind];
          /* The version readout is DATA — it exists only when there is a version to print.
             Every row used to render `Version  Not installed` in the tabular mono face
             reserved for version numbers, ~35px under a pill that had just said the same two
             words: the identical string twice per row, three times on one screen, the second
             instance dressed as a number. The pill is now the single carrier of install
             state, so the test hook that reads that state rides the pill whenever there is no
             version — same element, same role, same string, one place. */
          const version = status.installed ? status.installedVersion : null;
          const stateTestId = version ? undefined : `binary-${kind}-version`;
          const percent =
            kindProgress && kindProgress.total
              ? Math.min(100, Math.round((kindProgress.received / kindProgress.total) * 100))
              : null;

          return (
            <div
              key={kind}
              data-testid={`binary-${kind}`}
              className={cn(NESTED_SURFACE, "p-4")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-foreground/50"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {KIND_LABELS[kind]}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-foreground/55">
                      {KIND_ROLES[kind]}
                    </p>
                  </div>
                </div>
                {status.updateAvailable ? (
                  <Badge variant="warning" data-testid={stateTestId}>
                    Update available
                  </Badge>
                ) : status.installed ? (
                  <Badge variant="success" data-testid={stateTestId}>
                    Installed
                  </Badge>
                ) : (
                  <Badge variant="neutral" data-testid={stateTestId}>
                    Not installed
                  </Badge>
                )}
              </div>

              {(version || status.latestVersion) && (
                <div
                  className={cn(
                    "mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t pt-3 text-xs",
                    SECTION_RULE,
                    FULL_BLEED_SM,
                  )}
                >
                  {/* Two versions, one shape: a dim `label:` and a mono numeral. The label
                      used to be the word "Version" in front of the string "Installed: 9.9.9",
                      which named the datum twice and put a state word in the tabular face.
                      Now the mono face holds numerals only, and the pair reads as what it is
                      — the version you have against the version there is. */}
                  {version && (
                    <span
                      data-testid={`binary-${kind}-version`}
                      className="text-[11px] font-medium text-foreground/50"
                    >
                      {"Installed: "}
                      <span className="font-mono text-xs tabular-nums text-foreground/85">
                        {version}
                      </span>
                    </span>
                  )}
                  {status.latestVersion && (
                    <span className="text-[11px] font-medium text-foreground/50">
                      {"Latest: "}
                      <span className="font-mono text-xs tabular-nums text-foreground/85">
                        {status.latestVersion}
                      </span>
                    </span>
                  )}
                </div>
              )}

              {errors[kind] && (
                <div className="mt-3">
                  <SettingsError data-testid={`binary-${kind}-error`}>{errors[kind]}</SettingsError>
                </div>
              )}

              <AnimatePresence>
                {isInstalling && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]"
                  >
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
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-3 flex flex-wrap gap-2">
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
