import { useEffect, useState } from "react";
import type { AiProviderInfo, PromptInfo } from "@sift/ipc-contract";
import { KNOWN_PROVIDERS } from "@/lib/ai-provider-catalog";

const DEFAULT_MODEL_ID = "claude-opus-4-8";
// Stable empty-array ref so the model-sync effect doesn't re-fire every render.
const NO_MODELS: AiProviderInfo["models"] = [];

// PreviewCard has the same catalog-load + selection logic inline. Left it
// there (untouched, green e2e); consolidate into this hook if a third consumer appears.

/** Loads the configurable AI providers + user prompts and holds a provider/model/prompt
 * selection (defaults: first keyed provider, Opus, first prompt). Used by any view that
 * kicks off a summary. */
export function useAiPickers() {
  const [providers, setProviders] = useState<AiProviderInfo[]>(KNOWN_PROVIDERS);
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(
    null,
  );
  // The user's persisted default provider+model (Settings), or null. Seeds the initial selection.
  const [userDefaultModel, setUserDefaultModel] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<PromptInfo[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedPromptId, setSelectedPromptId] = useState<number | "">("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [customConfig, userDefault, keyFlags] = await Promise.all([
        window.sift.aiProviders.getCustomConfig(),
        window.sift.aiProviders.getDefault(),
        Promise.all(
          KNOWN_PROVIDERS.map((p) =>
            p.needsKey
              ? window.sift.aiProviders.keyStatus(p.id)
              : Promise.resolve(true),
          ),
        ),
      ]);
      if (cancelled) return;
      setProviders(
        KNOWN_PROVIDERS.map((p) =>
          p.id === "custom" && customConfig
            ? {
                ...p,
                models: [{ id: customConfig.model, label: customConfig.model }],
              }
            : p,
        ),
      );
      // The user's persisted default wins; otherwise the first keyed/available provider.
      const firstAvailable =
        KNOWN_PROVIDERS.find((_, i) => keyFlags[i])?.id ?? null;
      setDefaultProviderId(userDefault?.providerId ?? firstAvailable);
      setUserDefaultModel(userDefault?.model ?? null);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.sift.prompts.list().then(setPrompts);
  }, []);

  const models =
    providers.find((p) => p.id === selectedProviderId)?.models ?? NO_MODELS;

  useEffect(() => {
    if (!defaultProviderId) return;
    setSelectedProviderId((prev) =>
      prev && providers.some((p) => p.id === prev) ? prev : defaultProviderId,
    );
  }, [defaultProviderId, providers]);

  useEffect(() => {
    if (models.length === 0) {
      setSelectedModel("");
      return;
    }
    setSelectedModel((prev) =>
      prev && models.some((m) => m.id === prev)
        ? prev
        : (models.find((m) => m.id === userDefaultModel)?.id ??
          models.find((m) => m.id === DEFAULT_MODEL_ID)?.id ??
          models[0]!.id),
    );
  }, [models, userDefaultModel]);

  useEffect(() => {
    if (prompts.length === 0) return;
    setSelectedPromptId((prev) =>
      prev !== "" && prompts.some((p) => p.id === prev) ? prev : prompts[0]!.id,
    );
  }, [prompts]);

  return {
    providers,
    prompts,
    models,
    noProviderReady: defaultProviderId === null,
    selectedProviderId,
    setSelectedProviderId,
    selectedModel,
    setSelectedModel,
    selectedPromptId,
    setSelectedPromptId,
  };
}
