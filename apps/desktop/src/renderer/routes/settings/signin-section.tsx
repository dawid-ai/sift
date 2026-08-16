import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import type { SignedInSite } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CountTag,
  DESTRUCTIVE_ACTION,
  GroupLabel,
  NESTED_SURFACE,
  ROW_LIST,
  SettingsEmpty,
  SettingsError,
  StatusDot,
} from "./settings-page";

/** Opens the app-owned sign-in browser and lists sites with a saved session. */
export function SigninSection() {
  const [sites, setSites] = useState<SignedInSite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setSites(await window.sift.auth.listSites());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function openBrowser() {
    setBusy(true);
    setError(null);
    try {
      await window.sift.auth.openBrowser(); // resolves when the window closes
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(domain: string) {
    setError(null);
    try {
      await window.sift.auth.removeSite(domain);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="signin-section">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          data-testid="signin-open-browser"
          size="lg"
          disabled={busy}
          onClick={() => void openBrowser()}
        >
          <LogIn aria-hidden className="h-4 w-4" />
          {busy ? "Browser open…" : "Open sign-in browser"}
        </Button>
        <Button
          data-testid="signin-refresh"
          variant="outline"
          size="lg"
          onClick={() => void refresh()}
        >
          Refresh
        </Button>
      </div>

      {sites.length === 0 ? (
        <div>
          <GroupLabel className="mb-3">Saved sessions</GroupLabel>
          <SettingsEmpty
            icon={LogIn}
            title="No signed-in sites yet."
            hint="Open the sign-in browser and log in — the session is stored for downloads and transcripts."
          />
        </div>
      ) : (
        // One nested block; the label lives inside the container it describes and the rows
        // carry no surface of their own — just a hairline between them.
        <div className={cn(NESTED_SURFACE, "px-4 py-1")}>
          <div className="flex items-center py-3">
            <GroupLabel>Saved sessions</GroupLabel>
            <CountTag>{sites.length}</CountTag>
          </div>
          <ul className={cn("border-t border-white/[0.05]", ROW_LIST)}>
            {sites.map((s) => (
              <li
                key={s.domain}
                data-testid="signin-site-row"
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate font-medium text-foreground">{s.domain}</span>
                {/* One status vocabulary: a haloed dot AND a word — never a bare coloured
                    pixel with no legend. */}
                <StatusDot
                  tone={s.expired ? "warn" : "ok"}
                  label={s.expired ? "Expired" : "Active"}
                />
                {s.expired && (
                  <span className="truncate text-[12px] text-warning/85">
                    may be signed out — reopen to sign in
                  </span>
                )}
                {/* Destructive, so it must not look like Refresh: red ghost, and a lighter
                    border than the safe action beside it. */}
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn("ml-auto", DESTRUCTIVE_ACTION)}
                  data-testid="signin-site-remove"
                  onClick={() => void remove(s.domain)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <SettingsError>{error}</SettingsError>}
    </div>
  );
}
