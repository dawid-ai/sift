import { useCallback, useEffect, useState } from "react";
import type { QueueItem, QueueSpec } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { QueueSpecControls } from "@/components/queue-spec-controls";

/** Short human label for the selected download format, e.g. "1080p MP4", "Best video", "Audio only". */
function formatLabel(f: QueueSpec["format"]): string {
  if (f.kind === "audio") return "Audio only";
  const res = f.maxHeight ? `${f.maxHeight}p` : "Best video";
  return f.mp4 ? `${res} · MP4` : res;
}

/** True when the item's download op failed — nothing was captured, so it's a failure, not a "done". */
function isFailed(it: QueueItem): boolean {
  return it.status === "done" && it.ops?.download === "error";
}

/** "failed" / "done · 1 issue" / "done" status text from a queue item. */
function statusText(it: QueueItem): string {
  if (it.status !== "done" || !it.ops) return it.status === "running" ? "downloading" : it.status;
  if (isFailed(it)) return "failed";
  // Download succeeded (or was skipped); a transcript/summarize error is a partial issue.
  const issues = (["download", "transcript", "summarize"] as const).filter(
    (k) => it.ops![k] === "error",
  ).length;
  return issues > 0 ? `done · ${issues} issue${issues > 1 ? "s" : ""}` : "done";
}

function hasError(it: QueueItem): boolean {
  return Boolean(it.ops && (["download", "transcript", "summarize"] as const).some((k) => it.ops![k] === "error"));
}

/** Strips yt-dlp's noisy "Command failed: <huge command>" prefix, keeping the real "ERROR: …". */
function cleanErr(m: string): string {
  const i = m.indexOf("ERROR:");
  return (i >= 0 ? m.slice(i) : m).replace(/\s+/g, " ").trim();
}

/** One readable line per failed op, e.g. "transcript: ERROR: … Requested format is not available". */
function issueLines(it: QueueItem): string[] {
  const lines: string[] = [];
  if (it.ops) {
    for (const k of ["download", "transcript", "summarize"] as const) {
      if (it.ops[k] !== "error") continue;
      const raw = it.ops.messages?.[k] ?? it.error ?? "";
      lines.push(`${k}: ${raw ? cleanErr(raw) : "failed"}`);
    }
  }
  if (lines.length === 0 && it.error) lines.push(cleanErr(it.error));
  return lines;
}

export function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [urls, setUrls] = useState("");
  const [spec, setSpec] = useState<QueueSpec | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSpecChange = useCallback((s: QueueSpec) => setSpec(s), []);

  useEffect(() => {
    window.sift.queue.list().then(setItems);
    window.sift.queue.isPaused().then(setPaused);
    return window.sift.queue.onUpdate(setItems);
  }, []);

  const add = async () => {
    setError(null);
    if (!spec) return;
    const list = urls
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
    if (list.length === 0) return;
    try {
      await window.sift.queue.add(list, spec);
      setUrls("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const togglePause = async () => {
    if (paused) await window.sift.queue.resume();
    else await window.sift.queue.pause();
    setPaused(!paused);
  };

  return (
    <div data-testid="queue-page" className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <textarea
          data-testid="queue-urls"
          className="min-h-24 rounded border border-border bg-background p-2 font-mono text-sm"
          placeholder="One URL per line"
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
        />
        <QueueSpecControls onChange={onSpecChange} />
        <div className="flex items-center gap-2">
          <Button data-testid="queue-add" size="sm" onClick={add}>Add to queue</Button>
          <Button data-testid="queue-pause" size="sm" variant="outline" onClick={togglePause}>
            {paused ? "Resume" : "Pause"}
          </Button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <div className="flex flex-col gap-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">Queue is empty.</p>}
        {items.map((it) => (
          <div data-testid="queue-item" key={it.id} className="flex items-center gap-3 rounded border border-border p-3">
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm">{it.sourceUrl}</p>
              {it.spec && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  <span data-testid="queue-item-format" className="rounded bg-border px-1.5 py-px text-[10px] text-muted-foreground">{formatLabel(it.spec.format)}</span>
                  {it.spec.transcript && <span className="rounded bg-border px-1.5 py-px text-[10px] text-muted-foreground">Transcript</span>}
                  {it.spec.summarize && <span className="rounded bg-border px-1.5 py-px text-[10px] text-muted-foreground" title={`${it.spec.summarize.model} · prompt #${it.spec.summarize.promptId}`}>Summary</span>}
                </div>
              )}
              <p data-testid="queue-item-status" className={`mt-0.5 text-xs ${isFailed(it) ? "text-red-500" : hasError(it) ? "text-amber-500" : "text-muted-foreground"}`}>
                {statusText(it)}
                {it.status === "running" && it.progress !== null ? ` · ${it.progress}%` : ""}
              </p>
              {it.status === "running" && (
                <div data-testid="queue-item-progress" className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
                  <div
                    className={`h-full rounded-full bg-primary ${it.progress === null ? "w-1/3 animate-pulse" : "transition-all duration-300"}`}
                    style={it.progress === null ? undefined : { width: `${it.progress}%` }}
                  />
                </div>
              )}
              {it.status === "done" && issueLines(it).map((line, i) => (
                <p key={i} data-testid="queue-item-issue" className="mt-0.5 break-words text-xs text-amber-600/90">{line}</p>
              ))}
            </div>
            <Button data-testid="queue-item-up" size="sm" variant="outline" onClick={() => window.sift.queue.reorder(it.id, "up")}>{"↑"}</Button>
            <Button data-testid="queue-item-down" size="sm" variant="outline" onClick={() => window.sift.queue.reorder(it.id, "down")}>{"↓"}</Button>
            {(it.status === "queued" || it.status === "running") && (
              <Button data-testid="queue-item-cancel" size="sm" variant="outline" onClick={() => window.sift.queue.cancel(it.id)}>Cancel</Button>
            )}
            {it.status === "done" && hasError(it) && (
              <Button data-testid="queue-item-retry" size="sm" variant="outline" onClick={() => window.sift.queue.retry(it.id)}>Retry</Button>
            )}
            <Button data-testid="queue-item-remove" size="sm" variant="outline" onClick={() => window.sift.queue.remove(it.id)}>Remove</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
