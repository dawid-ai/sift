import { describe, expect, it } from "vitest";
import { ollamaReachable, startOllama } from "./ollama-health";

describe("ollamaReachable", () => {
  const url = "http://localhost:11434";
  it("true when the ping responds ok", async () => {
    const fake = (async () =>
      ({ ok: true }) as Response) as unknown as typeof fetch;
    expect(await ollamaReachable(url, fake)).toBe(true);
  });
  it("false on a non-ok response", async () => {
    const fake = (async () =>
      ({ ok: false }) as Response) as unknown as typeof fetch;
    expect(await ollamaReachable(url, fake)).toBe(false);
  });
  it("false when fetch throws (connection refused)", async () => {
    const fake = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(await ollamaReachable(url, fake)).toBe(false);
  });
});

describe("startOllama", () => {
  it("reports not-installed when spawn emits an error", async () => {
    const fakeSpawn = () => {
      const handlers: Record<string, (e: Error) => void> = {};
      // fire the error asynchronously, like a real ENOENT
      queueMicrotask(() => handlers.error?.(new Error("ENOENT")));
      return {
        on: (ev: string, cb: (e: Error) => void) => (handlers[ev] = cb),
        unref: () => {},
      };
    };
    expect(await startOllama(fakeSpawn)).toEqual({
      launched: false,
      reason: "not-installed",
    });
  });
  it("reports launched when spawn does not error", async () => {
    const fakeSpawn = () => ({ on: () => {}, unref: () => {} });
    expect(await startOllama(fakeSpawn)).toEqual({ launched: true });
  });
});
