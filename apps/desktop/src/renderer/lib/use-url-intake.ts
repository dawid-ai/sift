import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The two ways a URL reaches Home without being typed: dragged onto the window, or already
 * sitting in the clipboard.
 *
 * Both are suggestions, never actions. A dropped URL fills the field; a clipboard URL is
 * offered on a button the user has to press. Nothing here fetches metadata on its own —
 * reading the clipboard is cheap, but acting on it would mean the app hitting the network
 * because of something the user copied somewhere else entirely.
 */

/** First http(s) URL in `text`, or null. Accepts a bare `youtube.com/...` too, since that is
 * what a copy from an address bar or a chat message often looks like. */
export function firstUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 4096) return null;

  const explicit = /https?:\/\/[^\s<>"']+/i.exec(trimmed);
  if (explicit) return explicit[0].replace(/[),.]+$/, "");

  // A bare host with a path, on its own line — "youtube.com/watch?v=…".
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(trimmed))
    return `https://${trimmed}`;
  return null;
}

export interface UrlFill {
  url: string;
  nonce: number;
}

export interface UrlIntake {
  /** Hand to `<UrlInput fill=…>`. */
  fill: UrlFill | undefined;
  /** True while a drag carrying text (not files) is over the window. */
  draggingUrl: boolean;
  /** A URL sitting in the clipboard that hasn't been used yet, else null. */
  clipboardUrl: string | null;
  /** Fills the field with `url` — used by the clipboard suggestion and the palette. */
  accept: (url: string) => void;
  /** Dismisses the clipboard suggestion without using it. */
  dismissClipboard: () => void;
}

export function useUrlIntake(): UrlIntake {
  const [fill, setFill] = useState<UrlFill | undefined>(undefined);
  const [draggingUrl, setDraggingUrl] = useState(false);
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const nonce = useRef(0);
  /** Clipboard values already offered, so a dismissal (or a use) doesn't come straight back
   * on the next window focus. */
  const seen = useRef(new Set<string>());

  const accept = useCallback((url: string) => {
    nonce.current += 1;
    setFill({ url, nonce: nonce.current });
    seen.current.add(url);
    setClipboardUrl(null);
  }, []);

  const dismissClipboard = useCallback(() => {
    setClipboardUrl((current) => {
      if (current) seen.current.add(current);
      return null;
    });
  }, []);

  // Drag a link or selected text onto the window. `useFileImport` owns "Files" drags and
  // deliberately lets everything else fall through, so these two never fight.
  useEffect(() => {
    const carriesText = (e: DragEvent): boolean =>
      !!e.dataTransfer &&
      !e.dataTransfer.types.includes("Files") &&
      (e.dataTransfer.types.includes("text/uri-list") ||
        e.dataTransfer.types.includes("text/plain"));

    const onDragOver = (e: DragEvent): void => {
      if (!carriesText(e)) return;
      e.preventDefault();
      setDraggingUrl(true);
    };
    const onDragLeave = (e: DragEvent): void => {
      if (e.relatedTarget === null) setDraggingUrl(false);
    };
    const onDrop = (e: DragEvent): void => {
      if (!carriesText(e)) return;
      setDraggingUrl(false);
      const raw =
        e.dataTransfer?.getData("text/uri-list") ||
        e.dataTransfer?.getData("text/plain") ||
        "";
      const url = firstUrl(raw);
      if (!url) return;
      // Only swallow the drop once there is something to do with it — otherwise plain text
      // dropped into a text field must keep its normal behaviour.
      e.preventDefault();
      accept(url);
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [accept]);

  // Clipboard, on mount and whenever the window regains focus — which is exactly when the
  // user has come back from copying a link somewhere else.
  useEffect(() => {
    let cancelled = false;
    const check = async (): Promise<void> => {
      try {
        const text = await window.sift.app.readClipboardText();
        const url = firstUrl(text);
        if (cancelled || !url || seen.current.has(url)) return;
        setClipboardUrl(url);
      } catch {
        /* no clipboard access — the suggestion simply never appears */
      }
    };
    const onFocus = (): void => void check();
    void check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { fill, draggingUrl, clipboardUrl, accept, dismissClipboard };
}
