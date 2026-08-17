import { describe, expect, it } from "vitest";
import {
  OPENAI_ID,
  OPENAI_MODELS,
  createOpenAiProvider,
} from "./openai-provider";
import type { OpenAiChunk, OpenAiClientLike } from "./openai-provider";

function fakeClientFactory(): {
  clientFactory: (opts: {
    apiKey: string;
    baseURL?: string;
  }) => OpenAiClientLike;
  calls: Array<{ apiKey: string; baseURL?: string; createArgs: unknown }>;
} {
  const calls: Array<{
    apiKey: string;
    baseURL?: string;
    createArgs: unknown;
  }> = [];

  const clientFactory = (opts: {
    apiKey: string;
    baseURL?: string;
  }): OpenAiClientLike => ({
    chat: {
      completions: {
        create(args): AsyncIterable<OpenAiChunk> {
          calls.push({
            apiKey: opts.apiKey,
            baseURL: opts.baseURL,
            createArgs: args,
          });
          return {
            [Symbol.asyncIterator]() {
              const chunks: OpenAiChunk[] = [
                { choices: [{ delta: { content: "Hello " } }] },
                { choices: [{ delta: { content: "world" } }] },
              ];
              let i = 0;
              return {
                next: async () => {
                  if (i < chunks.length) {
                    return { value: chunks[i++] as OpenAiChunk, done: false };
                  }
                  return { value: undefined, done: true };
                },
              };
            },
          };
        },
      },
    },
  });

  return { clientFactory, calls };
}

describe("openai provider", () => {
  it("exposes id, label, needsKey, and the curated model list", () => {
    const { clientFactory } = fakeClientFactory();
    const provider = createOpenAiProvider({
      apiKey: "sk-test",
      clientFactory,
    });

    expect(provider.id).toBe(OPENAI_ID);
    expect(provider.label).toBe("OpenAI");
    expect(provider.needsKey).toBe(true);
    expect(provider.models()).toEqual(OPENAI_MODELS);
  });

  it("streams tokens in order and resolves the concatenated final text", async () => {
    const { clientFactory, calls } = fakeClientFactory();
    const provider = createOpenAiProvider({
      apiKey: "sk-test",
      clientFactory,
    });

    const received: string[] = [];
    const result = await provider.summarize(
      {
        model: "gpt-4o",
        systemPrompt: "S",
        content: "C",
        maxTokens: 4096,
      },
      (delta) => received.push(delta),
    );

    expect(result).toBe("Hello world");
    expect(received).toEqual(["Hello ", "world"]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.apiKey).toBe("sk-test");
    expect(calls[0]?.baseURL).toBeUndefined();
    expect(calls[0]?.createArgs).toEqual({
      model: "gpt-4o",
      max_tokens: 4096,
      stream: true,
      messages: [
        { role: "system", content: "S" },
        { role: "user", content: "C" },
      ],
    });
  });

  it("passes a baseURL override to the clientFactory (custom-provider reuse)", async () => {
    const { clientFactory, calls } = fakeClientFactory();
    const provider = createOpenAiProvider({
      apiKey: "sk-test",
      baseURL: "http://localhost:11434/v1",
      clientFactory,
    });

    await provider.summarize(
      { model: "gpt-4o", systemPrompt: "S", content: "C", maxTokens: 4096 },
      () => {},
    );

    expect(calls[0]?.baseURL).toBe("http://localhost:11434/v1");
  });

  it("allows id/label/models overrides (custom-provider reuse)", () => {
    const { clientFactory } = fakeClientFactory();
    const customModels = [{ id: "llama3", label: "Llama 3" }];
    const provider = createOpenAiProvider({
      apiKey: "sk-test",
      id: "custom",
      label: "Custom",
      models: customModels,
      clientFactory,
    });

    expect(provider.id).toBe("custom");
    expect(provider.label).toBe("Custom");
    expect(provider.needsKey).toBe(true);
    expect(provider.models()).toEqual(customModels);
  });
});
