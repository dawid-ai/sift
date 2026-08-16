import { useCallback, useEffect, useRef, useState } from "react";
import { isMediaFile } from "@sift/core";

const PROBE_TIMEOUT_MS = 5000;
const ALREADY_RUNNING = "An import is already running — wait for it to finish.";

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

/**
 * Classifies dropped files into ones ready to import and a single combined notice
 * describing anything skipped — either not a media file, or (per the `ponytail:` note
 * on `droppedPath` above) a media file whose path Electron didn't attach. Pure and
 * DOM-free so the classification is unit-testable without jsdom; `onDrop` re-pairs the
 * accepted entries with their `File` objects afterward for `probeDuration`.
 */
export function partitionDropped(
  files: { name: string; path: string | null }[],
): { entries: { path: string; name: string }[]; notice: string | null } {
  const entries: { path: string; name: string }[] = [];
  const notMedia: string[] = [];
  const unreadable: string[] = [];

  for (const file of files) {
    if (!isMediaFile(file.name)) {
      notMedia.push(file.name);
      continue;
    }
    if (!file.path) {
      unreadable.push(file.name);
      continue;
    }
    entries.push({ path: file.path, name: file.name });
  }

  const notices: string[] = [];
  if (notMedia.length > 0) {
    notices.push(`Not an audio or video file: ${notMedia.join(", ")}`);
  }
  if (unreadable.length > 0) {
    const verb = unreadable.length > 1 ? "live" : "lives";
    notices.push(
      `Couldn't read where ${unreadable.join(", ")} ${verb} on disk — go to Home and use “choose a file” instead.`,
    );
  }
  return { entries, notice: notices.length > 0 ? notices.join(" ") : null };
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
  // Ref, not state: a second drop/pick while a batch is in flight must be rejected
  // synchronously, and keeping this out of state means the drag-listener effect below
  // still only depends on `runImports` and registers its listeners exactly once.
  const running = useRef(false);

  const runImports = useCallback(
    async (entries: { path: string; file?: File; name: string }[], notice: string | null = null) => {
      running.current = true;
      const failures: string[] = [];
      // `landed` (not "imported"): `import.local` already committed the media + download
      // row by the time transcription runs below, so a failed transcribe must not hide a
      // landed row — Whisper is an on-demand binary, not installed by default, so this is
      // the common first-run path, not an edge case.
      let landed = 0;
      try {
        for (const entry of entries) {
          setBusy(entry.name);
          try {
            const durationSec = entry.file ? await probeDuration(entry.file) : null;
            const record = await window.sift.import.local({ path: entry.path, durationSec });
            landed += 1;
            // Short-circuits to synthesized metadata for file: URLs — no yt-dlp round trip.
            const metadata = await window.sift.metadata.fetch(record.sourceUrl);
            await window.sift.transcript.get({ metadata });
          } catch (e) {
            // Report and keep going: one undecodable file shouldn't abort the rest of the
            // batch. The row is already in the library even when the transcribe fails.
            failures.push(`${entry.name}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      } finally {
        running.current = false;
        setBusy(null);
      }
      // One combined message so an earlier failure (e.g. file 2 of 5) isn't overwritten by
      // a later one (file 4), and the caller's own classification notice (files rejected
      // before this batch even started, e.g. a .zip in the same drop) isn't overwritten
      // either — everything skipped or failed in this batch stays visible together.
      const messages = notice ? [notice, ...failures] : failures;
      if (messages.length > 0) setError(messages.join("; "));
      if (landed > 0) onDone();
    },
    [onDone],
  );

  const pick = useCallback(async () => {
    setError(null);
    if (running.current) {
      setError(ALREADY_RUNNING);
      return;
    }
    // Claim the flag *before* the dialog await, not after it resolves — otherwise a
    // second click while the native picker is still open passes the check above too
    // (check-then-set with an await in the gap). Only the two early-return paths below
    // (cancelled / IPC rejects) release it here; the success path hands the flag to
    // `runImports`, which already holds it (re-set is a harmless no-op) and clears it
    // itself once the batch finishes — no unconditional `finally` here, or it would
    // clear the flag out from under the batch that's now running.
    running.current = true;
    let paths: string[];
    try {
      paths = await window.sift.import.pick();
    } catch (e) {
      running.current = false;
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (paths.length === 0) {
      running.current = false;
      return;
    }
    // The dialog's `MEDIA_EXTENSIONS` filter is advisory only — on Windows a user can type
    // any path into the filename box past it — so re-run the same classification the drop
    // path uses and surface the identical notice, rather than letting a non-media file fail
    // thirty seconds later inside Whisper.
    const { entries, notice } = partitionDropped(
      paths.map((path) => ({ name: path.split(/[\\/]/).pop() ?? path, path })),
    );
    if (entries.length === 0) {
      running.current = false;
      if (notice) setError(notice);
      return;
    }
    await runImports(entries, notice);
  }, [runImports]);

  useEffect(() => {
    // preventDefault on dragover AND drop, gated to "Files" drags only, is what stops
    // Electron's default behavior of navigating the window to a dropped file — which
    // would blow away the whole app. Non-Files drags (a link, plain text) are left alone
    // so their own default handling (e.g. filling a text input) still works.
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      // Gate on "Files" first, matching onDragOver: a dropped link or text (e.g. toward the
      // Home URL input) must fall through to the browser's default handling instead of
      // being preventDefault-ed, so the input still accepts it normally. main/index.ts's
      // `will-navigate` guard is the backstop against that default turning into a
      // navigation away from the app.
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      setDragging(false);
      setError(null);
      if (running.current) {
        setError(ALREADY_RUNNING);
        return;
      }
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length === 0) return;

      const { entries, notice } = partitionDropped(
        files.map((file) => ({ name: file.name, path: droppedPath(file) })),
      );
      if (entries.length === 0) {
        if (notice) setError(notice);
        return;
      }

      // `entries` is a same-order subsequence of `files` filtered by the identical
      // (isMediaFile && path) condition partitionDropped applies, so re-filtering here
      // and zipping by position re-pairs each entry with its File without dragging the
      // DOM into the pure classification function above.
      const accepted = files.filter((file) => isMediaFile(file.name) && droppedPath(file) !== null);
      void runImports(entries.map((entry, i) => ({ ...entry, file: accepted[i] })), notice);
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
