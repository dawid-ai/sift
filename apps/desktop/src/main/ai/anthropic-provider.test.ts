import { describe, expect, it } from "vitest";
import { ANTHROPIC_ID, createAnthropicProvider } from "./anthropic-provider";
import type {
  AnthropicClientLike,
  AnthropicStreamLike,
} from "./anthropic-provider";

function fakeClientFactory(): {
  clientFactory: (apiKey: string) => AnthropicClientLike;
  calls: Array<{ apiKey: string; streamArgs: unknown }>;
} {
  const calls: Array<{ apiKey: string; streamArgs: unknown }> = [];

  const clientFactory = (apiKey: string): AnthropicClientLike => ({
    messages: {
      stream(args): AnthropicStreamLike {
        calls.push({ apiKey, streamArgs: args });
        let textHandler: ((delta: string) => void) | null = null;
        return {
          on(event, cb) {
            if (event === "text") {
              textHandler = cb;
              // synchronously invoke, as the real SDK stream emits deltas eagerly
              textHandler("Hello ");
              textHandler("world");
            }
          },
          finalMessage: async () => ({
            content: [{ type: "text", text: "Hello world" }],
          }),
        };
      },
    },
  });

  return { clientFactory, calls };
}

describe("anthropic provider", () => {
  it("exposes id, label, needsKey, and the curated model list", () => {
    const { clientFactory } = fakeClientFactory();
    const provider = createAnthropicProvider({
      apiKey: "sk-test",
      clientFactory,
    });

    expect(provider.id).toBe(ANTHROPIC_ID);
    expect(provider.label).toBe("Anthropic");
    expect(provider.needsKey).toBe(true);
    expect(provider.models().map((m) => m.id)).toContain("claude-opus-4-8");
  });

  it("streams tokens and resolves the concatenated final text", async () => {
    const { clientFactory, calls } = fakeClientFactory();
    const provider = createAnthropicProvider({
      apiKey: "sk-test",
      clientFactory,
    });

    const received: string[] = [];
    const result = await provider.summarize(
      {
        model: "claude-opus-4-8",
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
    expect(calls[0]?.streamArgs).toEqual({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      system: "S",
      messages: [{ role: "user", content: "C" }],
    });
  });
});
