export interface AiModelInfo {
  id: string;
  label: string;
}

export interface SummarizeInput {
  model: string;
  systemPrompt: string;
  content: string; // the fully-assembled user message (prompt body + transcript)
  maxTokens: number;
}

export type AiTokenFn = (delta: string) => void;

export interface AiProvider {
  id: string; // "anthropic" | "openai" | "ollama" | "custom"
  label: string;
  needsKey: boolean; // anthropic/openai true; ollama false
  models(): AiModelInfo[]; // curated static list (MVP); a live listModels lands later
  summarize(input: SummarizeInput, onToken: AiTokenFn): Promise<string>; // streams; resolves full text
}

/**
 * The AI providers that persist an API key on disk.
 *
 * SECURITY: a provider id becomes a filename under `userData/secrets/`, so it must never
 * reach the filesystem unchecked from the renderer. Every path that resolves a secrets
 * file validates against this list — see `main/paths.ts` `secretsFile`.
 */
export const KEYED_AI_PROVIDER_IDS = ["anthropic", "openai", "custom"] as const;

export type KeyedAiProviderId = (typeof KEYED_AI_PROVIDER_IDS)[number];

export function isKeyedAiProviderId(id: unknown): id is KeyedAiProviderId {
  return (
    typeof id === "string" &&
    (KEYED_AI_PROVIDER_IDS as readonly string[]).includes(id)
  );
}
