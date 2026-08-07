import { ipcMain } from "electron";
import type { AiRegistry } from "@sift/core";
import { IPC, type AiDefaultConfig, type AiProviderInfo, type CustomProviderConfig } from "@sift/ipc-contract";
import type { createSecrets } from "../secrets";
import type { createCustomConfigStore } from "../ai/custom-config";
import type { createAiDefaultConfigStore } from "../settings/ai-default-config";
import { isClaudeCliAvailable } from "../ai/claude-cli-provider";

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
    secretsFor(providerId).hasKey(),
  );

  ipcMain.handle(IPC.aiKeySet, (_event, providerId: string, key: string) => {
    secretsFor(providerId).setKey(key);
    rebuild(providerId, key);
  });

  ipcMain.handle(IPC.aiKeyClear, (_event, providerId: string) => {
    secretsFor(providerId).clearKey();
    registry.unregister(providerId);
  });

  ipcMain.handle(IPC.aiCustomConfigGet, () => customConfigStore.get());

  ipcMain.handle(
    IPC.aiCustomConfigSet,
    (_event, cfg: CustomProviderConfig) => {
      customConfigStore.set(cfg);
      const key = secretsFor("custom").getKey();
      if (key) rebuild("custom", key);
    },
  );

  ipcMain.handle(IPC.aiGetDefault, () => defaultStore.get());
  ipcMain.handle(IPC.aiSetDefault, (_event, cfg: AiDefaultConfig | null) => defaultStore.set(cfg));
  ipcMain.handle(IPC.aiCliStatus, () => isClaudeCliAvailable());

  ipcMain.handle(
    IPC.aiRunPrompt,
    (_event, input: { providerId: string; model: string; systemPrompt: string; content: string }) => {
      const provider = registry.get(input.providerId);
      if (!provider) throw new Error("Unknown AI provider.");
      return provider.summarize(
        { model: input.model, systemPrompt: input.systemPrompt, content: input.content, maxTokens: 8192 },
        () => {},
      );
    },
  );
}
