import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 500;

/**
 * Debounces `value`; fires `onUrl` with the trimmed value `delay` ms after the
 * last change. When `value` is blank, fires `onUrl("")` immediately (no
 * debounce) so callers can clear any stale preview/error state. Cancels the
 * pending timer on every re-run (change of `value`, `delay`, or `onUrl`) and
 * on unmount.
 */
function useDebouncedUrl(value: string, delay: number, onUrl: (url: string) => void) {
  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      onUrl("");
      return;
    }
    const timer = setTimeout(() => onUrl(trimmed), delay);
    return () => clearTimeout(timer);
  }, [value, delay, onUrl]);
}

export interface UrlInputProps {
  /** Called with the trimmed URL after the debounce window elapses, or "" immediately when input is cleared. */
  onUrl: (url: string) => void;
  debounceMs?: number;
}

export function UrlInput({ onUrl, debounceMs = DEBOUNCE_MS }: UrlInputProps) {
  const [value, setValue] = useState("");
  useDebouncedUrl(value, debounceMs, onUrl);

  return (
    <Input
      type="url"
      inputMode="url"
      autoComplete="off"
      spellCheck={false}
      placeholder="Paste a video URL…"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      data-testid="url-input"
      className="w-full max-w-xl"
    />
  );
}
