import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsError, SettingsHint } from "./settings-page";

/**
 * Proxy URL for yt-dlp and the remote AI providers. Empty means connect directly.
 *
 * Deliberately a save button rather than save-on-blur: the value is validated in main and a
 * bad one is rejected, so the user needs a moment where nothing has changed yet.
 */
export function NetworkSection() {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.sift.settings
      .getProxy()
      .then((v) => {
        setSaved(v);
        setDraft(v);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const dirty = saved !== null && draft.trim() !== saved;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const stored = await window.sift.settings.setProxy(draft);
      setSaved(stored);
      setDraft(stored);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="network-section">
      <div className="flex items-center gap-2">
        <Input
          data-testid="proxy-input"
          aria-label="Proxy URL"
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder="http://127.0.0.1:8080"
          value={draft}
          disabled={saved === null}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty && !busy) void save();
          }}
        />
        <Button
          data-testid="proxy-save"
          className="shrink-0"
          disabled={!dirty || busy}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
      <SettingsHint>
        Sends downloads and remote AI calls through a proxy. Supports{" "}
        <code className="font-mono text-foreground/75">http</code>,{" "}
        <code className="font-mono text-foreground/75">https</code>,{" "}
        <code className="font-mono text-foreground/75">socks4</code>, and{" "}
        <code className="font-mono text-foreground/75">socks5</code>. Leave it
        empty to connect directly. Ollama and the Claude CLI are local, so they
        ignore this.
      </SettingsHint>
      {saved !== null && saved.length > 0 && !dirty && (
        <SettingsHint data-testid="proxy-active">
          Active. It applies to the next request — nothing already in flight
          moves onto it.
        </SettingsHint>
      )}
      {error && <SettingsError>{error}</SettingsError>}
    </div>
  );
}
