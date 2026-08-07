import type { AiProviderInfo } from "@sift/ipc-contract";

/**
 * `aiProviders.list()` only reports providers that are already REGISTERED in the
 * main-process registry — and a keyed provider (anthropic/openai/custom) isn't
 * registered until its key is set. The Home provider picker and the Settings key
 * rows need to show every CONFIGURABLE provider even before it's keyed, so this is
 * a static mirror of the curated id/label/model lists the four built-in providers
 * report from `main/ai/*-provider.ts`.
 * // a static provider descriptor in the renderer avoids a chicken-and-egg
 * // where you can't pick/key a provider that isn't registered yet.
 */
export const KNOWN_PROVIDERS: AiProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    needsKey: true,
    models: [
      { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    needsKey: true,
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
    ],
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    needsKey: false,
    models: [
      { id: "llama3.1", label: "Llama 3.1" },
      { id: "mistral", label: "Mistral" },
    ],
  },
  {
    id: "claude-cli",
    label: "Claude Code CLI (subscription)",
    needsKey: false,
    models: [
      { id: "opus", label: "Claude Opus (subscription)" },
      { id: "sonnet", label: "Claude Sonnet (subscription)" },
      { id: "haiku", label: "Claude Haiku (subscription)" },
    ],
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    needsKey: true,
    // No curated list — the single model comes from the user's `getCustomConfig()`.
    models: [],
  },
];
