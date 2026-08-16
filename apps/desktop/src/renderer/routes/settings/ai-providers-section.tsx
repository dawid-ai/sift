import { useCallback, useEffect, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Bot, KeyRound, Terminal } from "lucide-react";
import { branding } from "@sift/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KNOWN_PROVIDERS } from "@/lib/ai-provider-catalog";
import { cn } from "@/lib/utils";
import {
  CountTag,
  DESTRUCTIVE_ACTION,
  FIELD,
  FULL_BLEED_SM,
  GroupLabel,
  MicroLabel,
  NESTED_SURFACE,
  SECTION_RULE,
  SettingRow,
  SettingsError,
  SettingsSelect,
} from "./settings-page";

const KEYED_PROVIDERS = KNOWN_PROVIDERS.filter((p) => p.needsKey);
const KEYLESS_PROVIDERS = KNOWN_PROVIDERS.filter((p) => !p.needsKey);

/** One provider block. Nested surface, icon chip, name, status pill — then its controls. */
function ProviderPanel({
  icon: Icon,
  label,
  status,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  status: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={cn(NESTED_SURFACE, "p-4")}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-foreground/50"
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <p className="truncate text-sm font-medium text-foreground">{label}</p>
        </div>
        {status}
      </div>
      {children}
    </div>
  );
}

/** Picks the default provider + model used to seed every provider picker in the app. */
function DefaultProviderControl() {
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");

  useEffect(() => {
    let cancelled = false;
    window.sift.aiProviders.getDefault().then((cfg) => {
      if (cancelled || !cfg) return;
      setProviderId(cfg.providerId);
      setModel(cfg.model);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const models = KNOWN_PROVIDERS.find((p) => p.id === providerId)?.models ?? [];

  function persist(nextProvider: string, nextModel: string) {
    setProviderId(nextProvider);
    setModel(nextModel);
    void window.sift.aiProviders.setDefault(nextProvider ? { providerId: nextProvider, model: nextModel } : null);
  }

  return (
    <SettingRow
      label="Default AI provider"
      hint={`Pre-selected everywhere ${branding.appName} uses AI (summaries, document polish).`}
    >
      <SettingsSelect
        data-testid="ai-default-provider"
        value={providerId}
        onChange={(e) => {
          const next = e.target.value;
          const first = KNOWN_PROVIDERS.find((p) => p.id === next)?.models[0]?.id ?? "";
          persist(next, first);
        }}
      >
        <option value="">Auto (first available)</option>
        {KNOWN_PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </SettingsSelect>
      {providerId && models.length > 0 && (
        <SettingsSelect
          data-testid="ai-default-model"
          value={model}
          onChange={(e) => persist(providerId, e.target.value)}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </SettingsSelect>
      )}
    </SettingRow>
  );
}

/** Keyless card for the Claude Code CLI provider — a detected/not-found probe + the ToS note. */
function ClaudeCliCard({ label }: { label: string }) {
  const [status, setStatus] = useState<"checking" | "found" | "missing">("checking");
  useEffect(() => {
    let cancelled = false;
    window.sift.aiProviders.cliStatus().then((ok) => {
      if (!cancelled) setStatus(ok ? "found" : "missing");
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <ProviderPanel
      icon={Terminal}
      label={label}
      status={
        <Badge
          data-testid="ai-cli-status"
          variant={status === "found" ? "success" : "neutral"}
        >
          {status === "checking" ? "Checking…" : status === "found" ? "Detected" : "Not found"}
        </Badge>
      }
    >
      <p
        data-testid="ai-provider-claude-cli"
        className={cn(
          "mt-3 border-t pt-3 text-[12px] leading-relaxed text-foreground/60 [text-wrap:pretty]",
          SECTION_RULE,
          FULL_BLEED_SM,
        )}
      >
        Uses your logged-in <code className="rounded bg-foreground/[0.07] px-1 py-0.5 font-mono text-[11px] text-foreground/80">claude</code> subscription — no API key. Requires Claude Code installed
        and signed in. Note: driving a consumer subscription from another app is a ToS grey area.
      </p>
    </ProviderPanel>
  );
}

/** Base_url + model fields for the `custom` (OpenAI-compatible) provider only. */
function CustomConfigFields() {
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.sift.aiProviders.getCustomConfig().then((cfg) => {
      if (cancelled || !cfg) return;
      setBaseUrl(cfg.baseUrl);
      setModel(cfg.model);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await window.sift.aiProviders.setCustomConfig({ baseUrl, model });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("mt-3 flex flex-col gap-2 border-t pt-3", SECTION_RULE, FULL_BLEED_SM)}>
      <MicroLabel>Endpoint</MicroLabel>
      {error && <SettingsError data-testid="ai-custom-error">{error}</SettingsError>}
      <div className="flex items-center gap-2">
        <Input
          data-testid="ai-custom-baseurl"
          placeholder="https://api.example.com/v1"
          value={baseUrl}
          disabled={saving}
          onChange={(e) => setBaseUrl(e.target.value)}
          className={cn(FIELD, "font-mono text-[13px]")}
        />
        <Input
          data-testid="ai-custom-model"
          placeholder="model-name"
          value={model}
          disabled={saving}
          onChange={(e) => setModel(e.target.value)}
          className={cn(FIELD, "max-w-[11rem] font-mono text-[13px]")}
        />
        <Button
          data-testid="ai-custom-save"
          size="lg"
          variant="outline"
          disabled={saving || !baseUrl || !model}
          onClick={() => void handleSave()}
        >
          {saving ? "Saving…" : "Save config"}
        </Button>
      </div>
    </div>
  );
}

/** `onKeyStatus` is a REPORT, not a control: the row still owns its own probe and its own
 * save/clear calls, exactly as before, and simply tells the group what it just learned so the
 * group's count can describe the rows instead of the array they were built from. */
function ProviderKeyRow({
  id,
  label,
  onKeyStatus,
}: {
  id: string;
  label: string;
  onKeyStatus: (id: string, hasKey: boolean) => void;
}) {
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.sift.aiProviders.keyStatus(id).then((status) => {
      if (cancelled) return;
      setHasKey(status);
      onKeyStatus(id, status);
    });
    return () => {
      cancelled = true;
    };
  }, [id, onKeyStatus]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await window.sift.aiProviders.setKey(id, keyInput);
      setKeyInput("");
      const status = await window.sift.aiProviders.keyStatus(id);
      setHasKey(status);
      onKeyStatus(id, status);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    setError(null);
    try {
      await window.sift.aiProviders.clearKey(id);
      const status = await window.sift.aiProviders.keyStatus(id);
      setHasKey(status);
      onKeyStatus(id, status);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setClearing(false);
    }
  }

  return (
    <ProviderPanel
      icon={KeyRound}
      label={label}
      status={
        <Badge data-testid={`ai-key-status-${id}`} variant={hasKey ? "success" : "neutral"}>
          {hasKey ? "Key saved" : "No key"}
        </Badge>
      }
    >
      <div className="mt-3 flex flex-col gap-2">
        {error && <SettingsError data-testid={`ai-key-error-${id}`}>{error}</SettingsError>}
        <div className="flex items-center gap-2">
          {/* type="password" is the masking — untouched. font-mono so a pasted key that
              does show (some providers echo a prefix) lines up like a key, not prose. */}
          <Input
            data-testid={`ai-key-input-${id}`}
            type="password"
            placeholder="sk-…"
            value={keyInput}
            disabled={saving || clearing}
            onChange={(e) => setKeyInput(e.target.value)}
            className={cn(FIELD, "font-mono text-[13px] tracking-[0.08em]")}
          />
          <Button
            data-testid={`ai-key-save-${id}`}
            size="lg"
            disabled={saving || clearing || !keyInput}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            data-testid={`ai-key-clear-${id}`}
            size="lg"
            variant="ghost"
            className={DESTRUCTIVE_ACTION}
            disabled={saving || clearing || !hasKey}
            onClick={() => void handleClear()}
          >
            {clearing ? "Clearing…" : "Clear"}
          </Button>
        </div>
      </div>
      {id === "custom" && <CustomConfigFields />}
    </ProviderPanel>
  );
}

export function AiProvidersSection() {
  /** Which keyed providers actually hold a key. Lifted for ONE reason: the group's CountTag
   * read `KEYED_PROVIDERS.length` — "Keys 3" printed directly above three rows that each said
   * "No key". A count that contradicts the three states under it is worse than no count. */
  const [keyed, setKeyed] = useState<Record<string, boolean>>({});
  const reportKeyStatus = useCallback((id: string, hasKey: boolean) => {
    setKeyed((prev) => (prev[id] === hasKey ? prev : { ...prev, [id]: hasKey }));
  }, []);
  const savedKeys = KEYED_PROVIDERS.filter((p) => keyed[p.id]).length;

  return (
    <div data-testid="ai-providers-section" className="flex flex-col gap-5">
      <DefaultProviderControl />

      <div className="flex flex-col gap-2">
        <div className="mb-1 flex items-center">
          <GroupLabel>Keys</GroupLabel>
          <CountTag>{`${savedKeys}/${KEYED_PROVIDERS.length}`}</CountTag>
        </div>
        {KEYED_PROVIDERS.map((p) => (
          <ProviderKeyRow key={p.id} id={p.id} label={p.label} onKeyStatus={reportKeyStatus} />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="mb-1 flex items-center">
          <GroupLabel>No key needed</GroupLabel>
          <CountTag>{KEYLESS_PROVIDERS.length}</CountTag>
        </div>
        {KEYLESS_PROVIDERS.map((p) =>
          p.id === "claude-cli" ? (
            <ClaudeCliCard key={p.id} label={p.label} />
          ) : (
            <ProviderPanel
              key={p.id}
              icon={Bot}
              label={p.label}
              status={<Badge variant="neutral">Local</Badge>}
            >
              <p
                data-testid={`ai-provider-${p.id}`}
                className={cn(
                  "mt-3 border-t pt-3 text-[12px] leading-relaxed text-foreground/60",
                  SECTION_RULE,
                  FULL_BLEED_SM,
                )}
              >
                Local — no key needed
              </p>
            </ProviderPanel>
          ),
        )}
      </div>
    </div>
  );
}
