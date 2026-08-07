import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KNOWN_PROVIDERS } from "@/lib/ai-provider-catalog";

const KEYED_PROVIDERS = KNOWN_PROVIDERS.filter((p) => p.needsKey);
const KEYLESS_PROVIDERS = KNOWN_PROVIDERS.filter((p) => !p.needsKey);
const SELECT_CLASS =
  "h-9 min-w-0 rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

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
    <Card>
      <CardHeader>
        <CardTitle>Default AI provider</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-foreground/60">
          Pre-selected everywhere Sift uses AI (summaries, document polish).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            data-testid="ai-default-provider"
            value={providerId}
            onChange={(e) => {
              const next = e.target.value;
              const first = KNOWN_PROVIDERS.find((p) => p.id === next)?.models[0]?.id ?? "";
              persist(next, first);
            }}
            className={SELECT_CLASS}
          >
            <option value="">Auto (first available)</option>
            {KNOWN_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          {providerId && models.length > 0 && (
            <select
              data-testid="ai-default-model"
              value={model}
              onChange={(e) => persist(providerId, e.target.value)}
              className={SELECT_CLASS}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          )}
        </div>
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{label}</CardTitle>
        <Badge data-testid="ai-cli-status" variant="outline">
          {status === "checking" ? "Checking…" : status === "found" ? "Detected" : "Not found"}
        </Badge>
      </CardHeader>
      <CardContent>
        <p data-testid="ai-provider-claude-cli" className="text-sm text-foreground/70">
          Uses your logged-in <code>claude</code> subscription — no API key. Requires Claude Code installed
          and signed in. Note: driving a consumer subscription from another app is a ToS grey area.
        </p>
      </CardContent>
    </Card>
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
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      {error && (
        <p data-testid="ai-custom-error" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Input
          data-testid="ai-custom-baseurl"
          placeholder="https://api.example.com/v1"
          value={baseUrl}
          disabled={saving}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <Input
          data-testid="ai-custom-model"
          placeholder="model-name"
          value={model}
          disabled={saving}
          onChange={(e) => setModel(e.target.value)}
        />
        <Button
          data-testid="ai-custom-save"
          size="sm"
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

function ProviderKeyRow({ id, label }: { id: string; label: string }) {
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
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await window.sift.aiProviders.setKey(id, keyInput);
      setKeyInput("");
      const status = await window.sift.aiProviders.keyStatus(id);
      setHasKey(status);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setClearing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{label}</CardTitle>
        <Badge data-testid={`ai-key-status-${id}`} variant="outline">
          {hasKey ? "Key saved" : "No key"}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && (
          <p data-testid={`ai-key-error-${id}`} className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Input
            data-testid={`ai-key-input-${id}`}
            type="password"
            placeholder="sk-…"
            value={keyInput}
            disabled={saving || clearing}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <Button
            data-testid={`ai-key-save-${id}`}
            size="sm"
            disabled={saving || clearing || !keyInput}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            data-testid={`ai-key-clear-${id}`}
            size="sm"
            variant="outline"
            disabled={saving || clearing || !hasKey}
            onClick={() => void handleClear()}
          >
            {clearing ? "Clearing…" : "Clear"}
          </Button>
        </div>
        {id === "custom" && <CustomConfigFields />}
      </CardContent>
    </Card>
  );
}

export function AiProvidersSection() {
  return (
    <div data-testid="ai-providers-section" className="flex flex-col gap-4">
      <DefaultProviderControl />
      {KEYED_PROVIDERS.map((p) => (
        <ProviderKeyRow key={p.id} id={p.id} label={p.label} />
      ))}
      {KEYLESS_PROVIDERS.map((p) =>
        p.id === "claude-cli" ? (
          <ClaudeCliCard key={p.id} label={p.label} />
        ) : (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle>{p.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p data-testid={`ai-provider-${p.id}`} className="text-sm text-foreground/70">
                Local — no key needed
              </p>
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}
