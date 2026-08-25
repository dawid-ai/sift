import { ipcMain } from "electron";
import {
  isKeyedAiProviderId,
  type AiRegistry,
  type KeyedAiProviderId,
} from "@sift/core";
import {
  IPC,
  type AiDefaultConfig,
  type AiProviderInfo,
  type CustomProviderConfig,
} from "@sift/ipc-contract";
import type { createSecrets } from "../secrets";
import type { createCustomConfigStore } from "../ai/custom-config";
import type { createAiDefaultConfigStore } from "../settings/ai-default-config";
import { isClaudeCliAvailable } from "../ai/claude-cli-provider";
import { nonEmptyStr, obj, str } from "./validate";
import { aiDefaultConfig, customProviderConfig } from "./validate-payloads";

/** SECURITY: a provider id selects a filename under `userData/secrets/`. Reject anything
 * outside the keyed-provider allowlist before it reaches the filesystem. */
function keyedProviderId(v: unknown): KeyedAiProviderId {
  const s = nonEmptyStr(v, "providerId", 100);
  if (!isKeyedAiProviderId(s)) throw new Error(`Unknown AI provider: ${s}`);
  return s;
}

type Secrets = ReturnType<typeof createSecrets>;
type CustomConfigStore = ReturnType<typeof createCustomConfigStore>;
type AiDefaultStore = ReturnType<typeof createAiDefaultConfigStore>;

/**
 * Registers the AI-provider/key IPC handlers, scoped per-provider (Phase 5b): each
 * keyed provider (anthropic, openai, custom) has its own encrypted secrets store,
 * resolved on demand via `secretsFor(providerId)`.
 *
 * `aiKeyClear` is a TRUE revoke: it clears the stored secret AND deregisters the
 * in-memory provider from `registry`, so a cleared key stops working immediately
 * instead of lingering until the next app launch (5a follow-up).
 *
 * `customConfigStore` holds the custom provider's NON-SECRET base_url/model (Task 4);
 * the key itself still goes through `secretsFor("custom")` like any other provider.
 * `aiCustomConfigSet` persists the config AND re-registers the custom provider via
 * `rebuild("custom", key)` if a key is already set — so the user doesn't need to
 * re-enter the key just to change the base_url/model.
 */
export function registerAiProvidersIpc(
  registry: AiRegistry,
  secretsFor: (providerId: string) => Secrets,
  rebuild: (providerId: string, key: string) => void,
  customConfigStore: CustomConfigStore,
  defaultStore: AiDefaultStore,
): void {
  ipcMain.handle(IPC.aiProvidersList, () =>
    registry.list().map((p): AiProviderInfo => ({
      id: p.id,
      label: p.label,
      needsKey: p.needsKey,
      models: p.models(),
    })),
  );

  ipcMain.handle(IPC.aiKeyStatus, (_event, providerId: string) =>
    secretsFor(keyedProviderId(providerId)).hasKey(),
  );

  ipcMain.handle(IPC.aiKeySet, (_event, providerId: string, key: string) => {
    const provider = keyedProviderId(providerId);
    secretsFor(provider).setKey(nonEmptyStr(key, "key", 4096));
    rebuild(provider, key);
  });

  ipcMain.handle(IPC.aiKeyClear, (_event, providerId: string) => {
    const provider = keyedProviderId(providerId);
    secretsFor(provider).clearKey();
    registry.unregister(provider);
  });

  ipcMain.handle(IPC.aiCustomConfigGet, () => customConfigStore.get());

  ipcMain.handle(IPC.aiCustomConfigSet, (_event, cfg: CustomProviderConfig) => {
    customConfigStore.set(customProviderConfig(cfg));
    const key = secretsFor("custom").getKey();
    if (key) rebuild("custom", key);
  });

  ipcMain.handle(IPC.aiGetDefault, () => defaultStore.get());
  ipcMain.handle(IPC.aiSetDefault, (_event, cfg: AiDefaultConfig | null) =>
    defaultStore.set(aiDefaultConfig(cfg)),
  );
  ipcMain.handle(IPC.aiCliStatus, () => isClaudeCliAvailable());

  ipcMain.handle(
    IPC.aiRunPrompt,
    (
      _event,
      raw: {
        providerId: string;
        model: string;
        systemPrompt: string;
        content: string;
      },
    ) => {
      const o = obj(raw, "input");
      const provider = registry.get(
        nonEmptyStr(o.providerId, "input.providerId", 100),
      );
      if (!provider) throw new Error("Unknown AI provider.");
      return provider.summarize(
        {
          model: nonEmptyStr(o.model, "input.model", 200),
          systemPrompt: str(
            o.systemPrompt ?? "",
            "input.systemPrompt",
            100_000,
          ),
          content: str(o.content ?? "", "input.content", 5_000_000),
          maxTokens: 8192,
        },
        () => {},
      );
    },
  );
}
