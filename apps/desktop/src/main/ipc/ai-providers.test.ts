import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiRegistry } from "@sift/core";
import { IPC } from "@sift/ipc-contract";
import type { createSecrets } from "../secrets";
import type {
  createCustomConfigStore,
  CustomConfig,
} from "../ai/custom-config";

type Secrets = ReturnType<typeof createSecrets>;
type CustomConfigStore = ReturnType<typeof createCustomConfigStore>;
type Handler = (event: unknown, ...args: unknown[]) => unknown;

const handlers = new Map<string, Handler>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, listener: Handler) => {
      handlers.set(channel, listener);
    },
  },
}));

// Imported after the mock so `registerAiProvidersIpc` picks up the faked `ipcMain`.
const { registerAiProvidersIpc } = await import("./ai-providers");

function fakeRegistry(): { registry: AiRegistry; unregisterCalls: string[] } {
  const unregisterCalls: string[] = [];
  const registry = {
    list: () => [],
    get: () => undefined,
    register: () => {},
    unregister: (id: string) => unregisterCalls.push(id),
  } as unknown as AiRegistry;
  return { registry, unregisterCalls };
}

function fakeSecrets(): Secrets & {
  hasKeyCalls: number;
  setKeyCalls: string[];
  clearKeyCalls: number;
} {
  const setKeyCalls: string[] = [];
  let clearKeyCalls = 0;
  let hasKeyCalls = 0;
  return {
    hasKey: () => {
      hasKeyCalls++;
      return true;
    },
    setKey: (plain: string) => {
      setKeyCalls.push(plain);
    },
    getKey: () => null,
    clearKey: () => {
      clearKeyCalls++;
    },
    get hasKeyCalls() {
      return hasKeyCalls;
    },
    get setKeyCalls() {
      return setKeyCalls;
    },
    get clearKeyCalls() {
      return clearKeyCalls;
    },
  };
}

function fakeCustomConfigStore(): CustomConfigStore & {
  setCalls: CustomConfig[];
  clearCalls: number;
} {
  let current: CustomConfig | null = null;
  const setCalls: CustomConfig[] = [];
  let clearCalls = 0;
  return {
    get: () => current,
    set: (cfg: CustomConfig) => {
      current = cfg;
      setCalls.push(cfg);
    },
    clear: () => {
      current = null;
      clearCalls++;
    },
    setCalls,
    get clearCalls() {
      return clearCalls;
    },
  };
}

function fakeAiDefaultStore(): { get(): null; set(): void } {
  return { get: () => null, set: () => {} };
}

describe("registerAiProvidersIpc", () => {
  beforeEach(() => {
    handlers.clear();
  });

  it("aiKeyStatus(providerId) resolves the provider-scoped secrets store and calls hasKey()", async () => {
    const { registry } = fakeRegistry();
    const anthropicSecrets = fakeSecrets();
    const secretsFor = vi.fn((id: string) => {
      expect(id).toBe("anthropic");
      return anthropicSecrets;
    });
    registerAiProvidersIpc(
      registry,
      secretsFor,
      vi.fn(),
      fakeCustomConfigStore(),
      fakeAiDefaultStore(),
    );

    const result = await handlers.get(IPC.aiKeyStatus)?.(null, "anthropic");

    expect(result).toBe(true);
    expect(anthropicSecrets.hasKeyCalls).toBe(1);
    expect(secretsFor).toHaveBeenCalledWith("anthropic");
  });

  it("aiKeySet(providerId, key) calls secretsFor(id).setKey(key) then rebuild(id, key)", async () => {
    const { registry } = fakeRegistry();
    const openaiSecrets = fakeSecrets();
    const secretsFor = vi.fn((id: string) => {
      expect(id).toBe("openai");
      return openaiSecrets;
    });
    const calls: Array<{ id: string; key: string }> = [];
    const rebuild = vi.fn((id: string, key: string) => calls.push({ id, key }));
    registerAiProvidersIpc(
      registry,
      secretsFor,
      rebuild,
      fakeCustomConfigStore(),
      fakeAiDefaultStore(),
    );

    await handlers.get(IPC.aiKeySet)?.(null, "openai", "k");

    expect(openaiSecrets.setKeyCalls).toEqual(["k"]);
    expect(calls).toEqual([{ id: "openai", key: "k" }]);
    expect(secretsFor).toHaveBeenCalledWith("openai");
  });

  it("aiKeyClear(providerId) calls secretsFor(id).clearKey() AND registry.unregister(id) — a true revoke", async () => {
    const { registry, unregisterCalls } = fakeRegistry();
    const anthropicSecrets = fakeSecrets();
    const secretsFor = vi.fn((id: string) => {
      expect(id).toBe("anthropic");
      return anthropicSecrets;
    });
    registerAiProvidersIpc(
      registry,
      secretsFor,
      vi.fn(),
      fakeCustomConfigStore(),
      fakeAiDefaultStore(),
    );

    await handlers.get(IPC.aiKeyClear)?.(null, "anthropic");

    expect(anthropicSecrets.clearKeyCalls).toBe(1);
    expect(unregisterCalls).toEqual(["anthropic"]);
  });

  it("aiProvidersList maps registry.list() to AiProviderInfo", async () => {
    const registry = {
      list: () => [
        {
          id: "anthropic",
          label: "Anthropic (Claude)",
          needsKey: true,
          models: () => [{ id: "m", label: "M" }],
        },
      ],
      get: () => undefined,
      register: () => {},
      unregister: () => {},
    } as unknown as AiRegistry;
    registerAiProvidersIpc(
      registry,
      vi.fn(),
      vi.fn(),
      fakeCustomConfigStore(),
      fakeAiDefaultStore(),
    );

    const result = await handlers.get(IPC.aiProvidersList)?.(null);

    expect(result).toEqual([
      {
        id: "anthropic",
        label: "Anthropic (Claude)",
        needsKey: true,
        models: [{ id: "m", label: "M" }],
      },
    ]);
  });

  it("aiCustomConfigGet resolves customConfigStore.get()", async () => {
    const { registry } = fakeRegistry();
    const customConfigStore = fakeCustomConfigStore();
    customConfigStore.set({ baseUrl: "http://x/v1", model: "m" });
    registerAiProvidersIpc(
      registry,
      vi.fn(),
      vi.fn(),
      customConfigStore,
      fakeAiDefaultStore(),
    );

    const result = await handlers.get(IPC.aiCustomConfigGet)?.(null);

    expect(result).toEqual({ baseUrl: "http://x/v1", model: "m" });
  });

  it("aiCustomConfigSet persists the config and rebuilds when a custom key is already set", async () => {
    const { registry } = fakeRegistry();
    const customSecrets = fakeSecrets();
    customSecrets.getKey = () => "sk-custom";
    const secretsFor = vi.fn((id: string) => {
      expect(id).toBe("custom");
      return customSecrets;
    });
    const rebuildCalls: Array<{ id: string; key: string }> = [];
    const rebuild = vi.fn((id: string, key: string) =>
      rebuildCalls.push({ id, key }),
    );
    const customConfigStore = fakeCustomConfigStore();
    registerAiProvidersIpc(
      registry,
      secretsFor,
      rebuild,
      customConfigStore,
      fakeAiDefaultStore(),
    );

    await handlers.get(IPC.aiCustomConfigSet)?.(null, {
      baseUrl: "http://x/v1",
      model: "m",
    });

    expect(customConfigStore.setCalls).toEqual([
      { baseUrl: "http://x/v1", model: "m" },
    ]);
    expect(secretsFor).toHaveBeenCalledWith("custom");
    expect(rebuildCalls).toEqual([{ id: "custom", key: "sk-custom" }]);
  });

  it("aiCustomConfigSet persists the config but does NOT rebuild when no custom key is set yet", async () => {
    const { registry } = fakeRegistry();
    const customSecrets = fakeSecrets();
    customSecrets.getKey = () => null;
    const secretsFor = vi.fn(() => customSecrets);
    const rebuild = vi.fn();
    const customConfigStore = fakeCustomConfigStore();
    registerAiProvidersIpc(
      registry,
      secretsFor,
      rebuild,
      customConfigStore,
      fakeAiDefaultStore(),
    );

    await handlers.get(IPC.aiCustomConfigSet)?.(null, {
      baseUrl: "http://x/v1",
      model: "m",
    });

    expect(customConfigStore.setCalls).toEqual([
      { baseUrl: "http://x/v1", model: "m" },
    ]);
    expect(rebuild).not.toHaveBeenCalled();
  });
});
