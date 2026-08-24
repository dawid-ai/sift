import { useCallback, useEffect, useState } from "react";
import type { StorageUsage } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { SettingsError, SettingsHint } from "./settings-page";

const UNITS = ["B", "KB", "MB", "GB", "TB"];

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

/**
 * Where the disk went, by category, with a **Clear** on the ones that come back on their own.
 *
 * Bars are sized against the largest row rather than the total: media usually dwarfs
 * everything else, and against the total every other row would render as a hairline.
 */
export function StorageSection() {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    window.sift.storage
      .usage()
      .then(setUsage)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(load, [load]);

  async function clear(key: string) {
    setBusy(key);
    setError(null);
    try {
      // Main shows the confirm and returns 0 if the user declined, so there is nothing to
      // check here — reloading covers both outcomes.
      await window.sift.storage.clear(key);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (error && !usage)
    return (
      <div data-testid="storage-section">
        <SettingsError>{error}</SettingsError>
      </div>
    );

  if (!usage)
    return (
      <div data-testid="storage-section">
        <SettingsHint>Measuring…</SettingsHint>
      </div>
    );

  const largest = Math.max(1, ...usage.entries.map((e) => e.bytes));

  return (
    <div className="flex flex-col gap-3" data-testid="storage-section">
      <ul className="flex flex-col gap-2.5">
        {usage.entries.map((e) => (
          <li key={e.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-foreground">{e.label}</span>
              <div className="flex items-center gap-2">
                <span
                  data-testid={`storage-bytes-${e.key}`}
                  className="font-mono text-[12px] tabular-nums text-foreground/75"
                >
                  {formatBytes(e.bytes)}
                </span>
                {e.clearable && e.bytes > 0 && (
                  <Button
                    data-testid={`storage-clear-${e.key}`}
                    variant="ghost"
                    className="h-7 px-2 text-[12px]"
                    disabled={busy !== null}
                    onClick={() => void clear(e.key)}
                  >
                    {busy === e.key ? "Clearing…" : "Clear"}
                  </Button>
                )}
              </div>
            </div>
            {/* Presentational only — the number next to the label is the accessible value. */}
            <div
              aria-hidden
              className="h-1 overflow-hidden rounded-full bg-white/[0.06]"
            >
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${Math.round((e.bytes / largest) * 100)}%` }}
              />
            </div>
            <span className="text-[11px] leading-relaxed text-foreground/50">
              {e.description}
            </span>
          </li>
        ))}
      </ul>
      <SettingsHint data-testid="storage-total">
        {formatBytes(usage.totalBytes)} in use
        {usage.freeBytes !== null &&
          `, ${formatBytes(usage.freeBytes)} free on the downloads volume`}
        . Downloaded media is removed per item in the Library, so a video and
        its transcript, summary, and slides go together.
      </SettingsHint>
      {error && <SettingsError>{error}</SettingsError>}
    </div>
  );
}
