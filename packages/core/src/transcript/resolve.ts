import type {
  TranscriptContext,
  TranscriptMethod,
  TranscriptProvider,
} from "./types";

/** Method-aware pick from a provider list, in registration order.
 * - "auto": first provider that canHandle (registration order decides precedence).
 * - "prefer_whisper": first local-and-canHandle provider; else first canHandle (any).
 * - "captions_only": first non-local canHandle provider; never returns a local provider. */
export function resolveTranscriptProvider(
  providers: TranscriptProvider[],
  ctx: TranscriptContext,
  method: TranscriptMethod,
): TranscriptProvider | null {
  const canHandle = (p: TranscriptProvider) => p.canHandle(ctx);
  if (method === "captions_only")
    return providers.find((p) => !p.local && canHandle(p)) ?? null;
  if (method === "prefer_whisper") {
    return (
      providers.find((p) => p.local && canHandle(p)) ??
      providers.find(canHandle) ??
      null
    );
  }
  return providers.find(canHandle) ?? null; // auto
}
