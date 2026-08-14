import { useCallback, useEffect, useState } from "react";
import { isMediaFile } from "@sift/core";

const PROBE_TIMEOUT_MS = 5000;

/**
 * Reads the absolute path Electron attaches to a dropped `File`.
 *
 * ponytail: `File.path` is Electron ≤31 only — Electron 32 removed it in favour of
 * `webUtils.getPathForFile(file)`, which must be called in the preload and exposed
 * through `window.sift`. The failure mode on that bump is SILENT (`path` becomes
 * undefined), which is why a missing path surfaces an error here instead of skipping
 * the file quietly. Upgrade path: add `getPathForFile` to the preload, call it here.
 */
function droppedPath(file: File): string | null {
  const path = (file as File & { path?: string }).path;
  return typeof path === "string" && path.length > 0 ? path : null;
}

/**
 * Reads a media file's duration with a throwaway `<video>` — no ffprobe, no new managed
 * binary. Resolves null when the browser can't decode it or takes too long: duration is
 * display-only and never worth blocking or failing an import over.
 */
function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);
    el.preload = "metadata";
    el.onloadedmetadata = () => finish(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => finish(null);
    el.src = url;
  });
}

export interface FileImportState {
  /** True while a drag carrying files is over the window. */
  dragging: boolean;
  /** Filename currently being imported/transcribed, else null. */
  busy: string | null;
  error: string | null;
  /** Opens the native picker and imports whatever is chosen. */
  pick: () => Promise<void>;
}

/**
 * Window-level file import. Handles both entry points (drop anywhere, or the native
 * picker) and runs files strictly one at a time so a multi-file drop doesn't launch
 * concurrent Whisper runs. Calls `onDone` once the batch finishes.
 */
export function useFileImport(onDone: () => void): FileImportState {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runImports = useCallback(
    async (entries: { path: string; file?: File; name: string }[]) => {
      setError(null);
      let imported = 0;
      for (const entry of entries) {
        setBusy(entry.name);
        try {
          const durationSec = entry.file ? await probeDuration(entry.file) : null;
          const record = await window.sift.import.local({ path: entry.path, durationSec });
          // Short-circuits to synthesized metadata for file: URLs — no yt-dlp round trip.
          const metadata = await window.sift.metadata.fetch(record.sourceUrl);
          await window.sift.transcript.get({ metadata });
          imported += 1;
        } catch (e) {
          // Report and keep going: one undecodable file shouldn't abort the rest of the
          // batch. The row is already in the library even when the transcribe fails.
          setError(`${entry.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      setBusy(null);
      if (imported > 0) onDone();
    },
    [onDone],
  );

  const pick = useCallback(async () => {
    const paths = await window.sift.import.pick();
    if (paths.length === 0) return;
    await runImports(paths.map((path) => ({ path, name: path.split(/[\\/]/).pop() ?? path })));
  }, [runImports]);

  useEffect(() => {
    // preventDefault on dragover AND drop is what stops Electron's default behavior of
    // navigating the window to the dropped file — which would blow away the whole app.
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length === 0) return;

      const entries: { path: string; file?: File; name: string }[] = [];
      const rejected: string[] = [];
      for (const file of files) {
        if (!isMediaFile(file.name)) {
          rejected.push(file.name);
          continue;
        }
        const path = droppedPath(file);
        if (!path) {
          setError(
            `Couldn't read where ${file.name} lives on disk. Use “Choose file…” instead.`,
          );
          continue;
        }
        entries.push({ path, file, name: file.name });
      }
      if (rejected.length > 0) {
        setError(`Not an audio or video file: ${rejected.join(", ")}`);
      }
      if (entries.length > 0) void runImports(entries);
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [runImports]);

  return { dragging, busy, error, pick };
}
