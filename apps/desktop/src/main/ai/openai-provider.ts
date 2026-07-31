import OpenAI from "openai";
import type { AiModelInfo, AiProvider } from "@sift/core";

export const OPENAI_ID = "openai";

export const OPENAI_MODELS: AiModelInfo[] = [
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
];

// Minimal structural type of the streaming chat.completions surface (async-iterable of chunks),
// so the provider is unit-testable with a fake (no network).
export interface OpenAiChunk {
  choices: Array<{ delta: { content?: string | null } }>;
}

export interface OpenAiClientLike {
  chat: {
    completions: {
      create(args: {
        model: string;
        max_tokens: number;
        stream: true;
        messages: Array<{ role: "system" | "user"; content: string }>;
      }): AsyncIterable<OpenAiChunk>;
    };
  };
}

export function createOpenAiProvider(deps: {
  apiKey: string;
  baseURL?: string; // set for the custom provider (Task 4)
  id?: string;
  label?: string;
  models?: AiModelInfo[]; // overridable for custom
  clientFactory?: (opts: {
    apiKey: string;
    baseURL?: string;
  }) => OpenAiClientLike;
}): AiProvider {
  const { apiKey, baseURL } = deps;
  const clientFactory: (opts: {
    apiKey: string;
    baseURL?: string;
  }) => OpenAiClientLike =
    deps.clientFactory ??
    // The real SDK's `create()` returns an APIPromise<Stream<ChatCompletionChunk>>, which is
    // structurally an AsyncIterable of our minimal OpenAiChunk shape once streamed — but its
    // overloaded signature doesn't structurally match OpenAiClientLike, hence the cast at this seam.
    (({ apiKey, baseURL }) =>
      new OpenAI({ apiKey, baseURL }) as unknown as OpenAiClientLike);
  const models = deps.models ?? OPENAI_MODELS;

  return {
    id: deps.id ?? OPENAI_ID,
    label: deps.label ?? "OpenAI",
    needsKey: true,
    models() {
      return models;
    },
    // chat.completions streaming (not the Responses API) — the widely-compatible
    // surface every OpenAI-compatible endpoint (incl. custom base_url + many local servers)
    // implements, which is exactly what the custom provider reuses.
    async summarize(input, onToken) {
      const client = clientFactory({ apiKey, baseURL });
      const stream = await client.chat.completions.create({
        model: input.model,
        max_tokens: input.maxTokens,
        stream: true,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.content },
        ],
      });

      let acc = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          onToken(delta);
          acc += delta;
        }
      }
      return acc;
    },
  };
}
