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

/** Signs in through the user's Chrome/Edge or the app-owned browser, and lists sites
 * with a saved session. */
export function SigninSection() {
  const [sites, setSites] = useState<SignedInSite[]>([]);
  const [busy, setBusy] = useState(false);
  const [chromeName, setChromeName] = useState<string | null>(null);
  const [chromeBusy, setChromeBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
    window.sift.auth
      .chromeBrowser()
      .then(setChromeName)
      .catch(() => setChromeName(null));
  }, []);

  async function signInWithChrome() {
    setChromeBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await window.sift.auth.signInWithChrome(); // resolves after the window closes
      setNotice(
        result.youtubeSignedIn
          ? `Signed in to YouTube through ${result.browser}.`
          : `No YouTube sign-in found. Sign in to your Google account in the ${result.browser} window before closing it.`,
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChromeBusy(false);
    }
  }

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
      {chromeName && (
        <div className="flex flex-col gap-1.5">
          <div>
            <Button
              data-testid="signin-chrome"
              size="lg"
              disabled={chromeBusy}
              onClick={() => void signInWithChrome()}
            >
              <LogIn aria-hidden className="h-4 w-4" />
              {chromeBusy
                ? `Waiting for ${chromeName} to close…`
                : `Sign in with ${chromeName}`}
            </Button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            {`Use this for YouTube — Google blocks sign-in from the built-in browser. ${chromeName} opens on a profile only Sift uses. Sign in, then close the window.`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          data-testid="signin-open-browser"
          size="lg"
          variant={chromeName ? "outline" : "default"}
          disabled={busy}
          onClick={() => void openBrowser()}
        >
          <LogIn aria-hidden className="h-4 w-4" />
          {busy
            ? "Browser open…"
            : chromeName
              ? "Open built-in browser"
              : "Open sign-in browser"}
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
                <span className="min-w-0 truncate font-medium text-foreground">
                  {s.domain}
                </span>
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

      {notice && (
        <p data-testid="signin-notice" className="text-sm text-foreground/85">
          {notice}
        </p>
      )}
      {error && <SettingsError>{error}</SettingsError>}
    </div>
  );
}
