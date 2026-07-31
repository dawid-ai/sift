import { toNetscapeCookies, type NetscapeCookieInput } from "./netscape";
import { registrableDomain } from "./status";

// Node-loadable: Electron session/window/fs access is injected (see index.ts wiring),
// so all logic here is unit-tested without Electron.

/** A cookie read from the auth session. `expirationDate` = seconds since epoch. */
export interface ManagerCookie {
  domain: string;
  path: string;
  secure: boolean;
  expirationDate?: number;
  name: string;
  value: string;
}

/** A site the user is signed into (best-effort: it has saved cookies). */
export interface SignedInSite {
  domain: string;
  expired: boolean;
}

export interface AuthManagerDeps {
  /** Every cookie in the `persist:auth` session. */
  readAllCookies: () => Promise<ManagerCookie[]>;
  /** Clears cookies whose registrable domain equals `domain`. */
  removeCookiesForDomain: (domain: string) => Promise<void>;
  /** Opens (or focuses) the sign-in browser; resolves when it closes. */
  openBrowser: () => Promise<void>;
  /** Absolute path for the exported cookies.txt. */
  cookiesPath: () => string;
  writeFile: (path: string, data: string) => void;
  removeFile: (path: string) => void;
}

export interface AuthManager {
  listSites(): Promise<SignedInSite[]>;
  openBrowser(): Promise<void>;
  removeSite(domain: string): Promise<void>;
  cookiesFileForUrl(url: string): Promise<string | null>;
  reportAuthFailure(url: string): void;
}

export function createAuthManager(deps: AuthManagerDeps): AuthManager {
  const flagged = new Set<string>();

  return {
    async listSites(): Promise<SignedInSite[]> {
      const cookies = await deps.readAllCookies();
      const domains = new Set<string>();
      for (const c of cookies) {
        const d = registrableDomain(c.domain);
        if (d) domains.add(d);
      }
      return [...domains]
        .sort()
        .map((domain) => ({ domain, expired: flagged.has(domain) }));
    },

    openBrowser(): Promise<void> {
      return deps.openBrowser();
    },

    async removeSite(domain: string): Promise<void> {
      flagged.delete(domain);
      await deps.removeCookiesForDomain(domain);
    },

    async cookiesFileForUrl(_url: string): Promise<string | null> {
      const cookies = await deps.readAllCookies();
      if (cookies.length === 0) {
        // No session → delete any stale export so the whole jar's session tokens don't
        // linger on disk after the user signs out / removes their last site.
        deps.removeFile(deps.cookiesPath());
        return null;
      }
      const input: NetscapeCookieInput[] = cookies.map((c) => ({
        domain: c.domain, path: c.path, secure: c.secure,
        expirationDate: c.expirationDate, name: c.name, value: c.value,
      }));
      const path = deps.cookiesPath();
      deps.writeFile(path, toNetscapeCookies(input));
      return path;
    },

    reportAuthFailure(url: string): void {
      let host: string;
      try {
        host = new URL(url).host;
      } catch {
        return;
      }
      const d = registrableDomain(host);
      if (d) flagged.add(d);
    },
  };
}
