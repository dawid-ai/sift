import { describe, expect, it } from "vitest";
import { OLLAMA_ID, createOllamaProvider, parseOllamaChunks } from "./ollama-provider";

/** Builds a fake `Response`-like object whose `body.getReader()` streams the given text
 *  as a sequence of `Uint8Array` chunks (one chunk per array entry), matching the
 *  `response.body!.getReader()` + `TextDecoder` read strategy the provider implements. */
function fakeStreamResponse(
  ok: boolean,
  chunks: string[],
): { ok: boolean; body: { getReader(): ReadableStreamDefaultReader<Uint8Array> } } {
  const encoder = new TextEncoder();
  let i = 0;
  const reader = {
    read: async () => {
      if (i < chunks.length) {
        const value = encoder.encode(chunks[i++]);
        return { value, done: false };
      }
      return { value: undefined, done: true };
    },
    releaseLock: () => {},
  } as unknown as ReadableStreamDefaultReader<Uint8Array>;

  return {
    ok,
    body: { getReader: () => reader },
  };
}

describe("parseOllamaChunks", () => {
  it("parses complete newline-terminated NDJSON lines", () => {
    const text = '{"message":{"content":"Hi "},"done":false}\n{"message":{"content":"there"},"done":true}\n';
    expect(parseOllamaChunks(text)).toEqual([
      { content: "Hi ", done: false },
      { content: "there", done: true },
    ]);
  });

  it("ignores blank lines", () => {
    const text = '{"message":{"content":"Hi "},"done":false}\n\n{"message":{"content":"there"},"done":true}\n';
    expect(parseOllamaChunks(text)).toEqual([
      { content: "Hi ", done: false },
      { content: "there", done: true },
    ]);
  });

  it("does not parse a trailing partial line without a newline", () => {
    const text = '{"message":{"content":"Hi "},"done":false}\n{"message":{"content":"partial"';
    expect(parseOllamaChunks(text)).toEqual([{ content: "Hi ", done: false }]);
  });

  it("defaults content to empty string when message.content is missing", () => {
    const text = '{"done":true}\n';
    expect(parseOllamaChunks(text)).toEqual([{ content: "", done: true }]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseOllamaChunks("")).toEqual([]);
  });
});

describe("ollama provider", () => {
  it("exposes id, label, needsKey=false, and the injected model list (falling back to default)", () => {
    const provider = createOllamaProvider({ fetchImpl: async () => fakeStreamResponse(true, []) as never });

    expect(provider.id).toBe(OLLAMA_ID);
    expect(provider.label).toBe("Ollama (local)");
    expect(provider.needsKey).toBe(false);
    expect(provider.models()).toEqual([
      { id: "llama3.1", label: "Llama 3.1" },
      { id: "mistral", label: "Mistral" },
    ]);
  });

  it("returns the injected models fallback when provided", () => {
    const customModels = [{ id: "phi3", label: "Phi-3" }];
    const provider = createOllamaProvider({
      models: customModels,
      fetchImpl: async () => fakeStreamResponse(true, []) as never,
    });

    expect(provider.models()).toEqual(customModels);
  });

  it("streams tokens in order, resolves the concatenated text, and POSTs /api/chat with stream:true + messages", async () => {
    const calls: Array<{ url: string; init: unknown }> = [];
    const line1 = '{"message":{"content":"Hi "},"done":false}\n';
    const line2 = '{"message":{"content":"there"},"done":true}\n';

    const fetchImpl = (async (url: string, init: unknown) => {
      calls.push({ url, init });
      return fakeStreamResponse(true, [line1, line2]) as never;
    }) as typeof fetch;

    const provider = createOllamaProvider({ fetchImpl });

    const received: string[] = [];
    const result = await provider.summarize(
      { model: "llama3.1", systemPrompt: "S", content: "C", maxTokens: 4096 },
      (delta) => received.push(delta),
    );

    expect(result).toBe("Hi there");
    expect(received).toEqual(["Hi ", "there"]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:11434/api/chat");
    const init = calls[0]?.init as { method: string; body: string };
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      model: "llama3.1",
      stream: true,
      messages: [
        { role: "system", content: "S" },
        { role: "user", content: "C" },
      ],
    });
  });

  it("handles a chunk split mid-line across reads", async () => {
    // The NDJSON line is split across two reader.read() chunks, mid-object.
    const part1 = '{"message":{"content":"Hi ';
    const part2 = '"},"done":true}\n';

    const provider = createOllamaProvider({
      fetchImpl: async () => fakeStreamResponse(true, [part1, part2]) as never,
    });

    const received: string[] = [];
    const result = await provider.summarize(
      { model: "llama3.1", systemPrompt: "S", content: "C", maxTokens: 4096 },
      (delta) => received.push(delta),
    );

    expect(result).toBe("Hi ");
    expect(received).toEqual(["Hi "]);
  });

  it("respects a custom baseUrl", async () => {
    const calls: string[] = [];
    const provider = createOllamaProvider({
      baseUrl: "http://192.168.1.5:11434",
      fetchImpl: (async (url: string) => {
        calls.push(url);
        return fakeStreamResponse(true, ['{"message":{"content":"x"},"done":true}\n']) as never;
      }) as typeof fetch,
    });

    await provider.summarize(
      { model: "llama3.1", systemPrompt: "S", content: "C", maxTokens: 4096 },
      () => {},
    );

    expect(calls).toEqual(["http://192.168.1.5:11434/api/chat"]);
  });

  it("throws a clear error when the response is not ok", async () => {
    const provider = createOllamaProvider({
      fetchImpl: async () => fakeStreamResponse(false, []) as never,
    });

    await expect(
      provider.summarize({ model: "llama3.1", systemPrompt: "S", content: "C", maxTokens: 4096 }, () => {}),
    ).rejects.toThrow("Could not reach Ollama at http://localhost:11434. Is it running?");
  });

  it("throws a clear error on a connection error (fetch rejects)", async () => {
    const provider = createOllamaProvider({
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });

    await expect(
      provider.summarize({ model: "llama3.1", systemPrompt: "S", content: "C", maxTokens: 4096 }, () => {}),
    ).rejects.toThrow("Could not reach Ollama at http://localhost:11434. Is it running?");
  });
});
