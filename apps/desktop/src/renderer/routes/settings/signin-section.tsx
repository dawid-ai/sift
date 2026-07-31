import { useEffect, useState } from "react";
import type { SignedInSite } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-col gap-3" data-testid="signin-section">
      <p className="text-sm text-foreground/60">
        Open a browser the app controls, sign into any site (YouTube, Vimeo, &hellip;), and its
        session is used for downloads and transcripts &mdash; fixing &ldquo;confirm you&apos;re
        not a bot&rdquo;. Your credentials go straight to the site.
      </p>
      <div className="flex gap-2">
        <Button data-testid="signin-open-browser" disabled={busy} onClick={() => void openBrowser()}>
          {busy ? "Browser open…" : "Open sign-in browser"}
        </Button>
        <Button data-testid="signin-refresh" variant="outline" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {sites.map((s) => (
          <li
            key={s.domain}
            data-testid="signin-site-row"
            className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span className={`h-2.5 w-2.5 flex-none rounded-full ${s.expired ? "bg-amber-500" : "bg-green-500"}`} />
            <span className="font-medium">{s.domain}</span>
            {s.expired && <span className="text-foreground/50">may be signed out — reopen to sign in</span>}
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              data-testid="signin-site-remove"
              onClick={() => void remove(s.domain)}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {sites.length === 0 && <p className="text-sm text-foreground/60">No signed-in sites yet.</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
