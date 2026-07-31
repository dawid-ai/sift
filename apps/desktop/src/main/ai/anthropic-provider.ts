import Anthropic from "@anthropic-ai/sdk";
import type { AiModelInfo, AiProvider } from "@sift/core";

export const ANTHROPIC_ID = "anthropic";

export const ANTHROPIC_MODELS: AiModelInfo[] = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
];

// Minimal structural type of the SDK surface we use, so the provider is unit-testable with a fake.
export interface AnthropicStreamLike {
  on(event: "text", cb: (delta: string) => void): void;
  finalMessage(): Promise<{ content: Array<{ type: string; text?: string }> }>;
}

export interface AnthropicClientLike {
  messages: {
    stream(args: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: "user"; content: string }>;
    }): AnthropicStreamLike;
  };
}

export function createAnthropicProvider(deps: {
  apiKey: string;
  clientFactory?: (apiKey: string) => AnthropicClientLike;
}): AiProvider {
  const { apiKey } = deps;
  const clientFactory: (apiKey: string) => AnthropicClientLike =
    deps.clientFactory ?? ((k) => new Anthropic({ apiKey: k }));

  return {
    id: ANTHROPIC_ID,
    label: "Anthropic (Claude)",
    needsKey: true,
    models() {
      return ANTHROPIC_MODELS;
    },
    // no thinking + a fixed 4096 max_tokens default (set by the caller) — summaries
    // are a straightforward transform; adaptive thinking / higher caps only if summary quality demands it.
    async summarize(input, onToken) {
      const client = clientFactory(apiKey);
      const stream = client.messages.stream({
        model: input.model,
        max_tokens: input.maxTokens,
        system: input.systemPrompt,
        messages: [{ role: "user", content: input.content }],
      });
      stream.on("text", (delta) => onToken(delta));
      const msg = await stream.finalMessage();
      return msg.content
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
    },
  };
}
