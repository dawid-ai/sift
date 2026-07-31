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
