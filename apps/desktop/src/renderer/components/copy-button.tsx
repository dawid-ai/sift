import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Copies `value` to the clipboard and confirms it in place for two seconds.
 *
 * The confirmation is the whole point: a copy button that looks identical before and after
 * the click leaves the user pressing it twice to be sure. `value` is a getter so a row can
 * hand over a large transcript without building the string on every render.
 */
export function CopyButton({
  value,
  label,
  copiedLabel = "Copied",
  className,
  testId,
  icon = true,
}: {
  value: string | (() => string);
  label: string;
  copiedLabel?: string;
  className?: string;
  testId?: string;
  icon?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async (): Promise<void> => {
    const text = typeof value === "function" ? value() : value;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
    } catch {
      // Clipboard access can be refused; say so rather than showing a false "Copied".
      setFailed(true);
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 2000);
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      type="button"
      data-testid={testId}
      className={cn(className)}
      onClick={() => void copy()}
    >
      {icon &&
        (copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        ))}
      {failed ? "Copy failed" : copied ? copiedLabel : label}
    </Button>
  );
}
