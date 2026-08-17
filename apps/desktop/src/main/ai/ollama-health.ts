import { spawn } from "node:child_process";
import { DEFAULT_OLLAMA_BASE_URL } from "./ollama-provider";

export { DEFAULT_OLLAMA_BASE_URL };

/** Minimal shape of the spawned child this module needs (injectable for tests). */
export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: object,
) => { on(ev: "error", cb: (e: Error) => void): void; unref(): void };

/** True when Ollama answers its /api/tags endpoint within the timeout. Any error → false. */
export async function ollamaReachable(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 1500,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Attempts to launch `ollama serve` detached. "launched" means the process spawned, not that
 * the server is up — the caller confirms with a follow-up ollamaReachable. An ENOENT (not on
 * PATH / not installed) resolves to { launched:false, reason:"not-installed" }. */
export function startOllama(
  spawnImpl: SpawnFn = spawn as unknown as SpawnFn,
): Promise<{
  launched: boolean;
  reason?: "not-installed";
}> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawnImpl("ollama", ["serve"], {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", () => {
      if (settled) return;
      settled = true;
      resolve({ launched: false, reason: "not-installed" });
    });
    child.unref();
    // No synchronous spawn error → assume it launched. A real ENOENT fires on the next tick,
    // so give it a microtask/short delay to win the race before we report success.
    setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ launched: true });
    }, 50);
  });
}
