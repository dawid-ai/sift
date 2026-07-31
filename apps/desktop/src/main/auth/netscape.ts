// apps/desktop/src/main/auth/netscape.ts

/** A cookie in the shape needed to write one Netscape `cookies.txt` line
 * (a subset of Electron's `Cookie`). `expirationDate` is seconds since epoch; omitted = session cookie. */
export interface NetscapeCookieInput {
  domain: string;
  path: string;
  secure: boolean;
  expirationDate?: number;
  name: string;
  value: string;
}

const HEADER = "# Netscape HTTP Cookie File";

/** Serializes cookies to the Netscape `cookies.txt` format that yt-dlp reads via `--cookies`. */
export function toNetscapeCookies(cookies: NetscapeCookieInput[]): string {
  const lines = [HEADER];
  for (const c of cookies) {
    const includeSub = c.domain.startsWith(".") ? "TRUE" : "FALSE";
    const secure = c.secure ? "TRUE" : "FALSE";
    const expiry = c.expirationDate ? Math.floor(c.expirationDate) : 0;
    lines.push([c.domain, includeSub, c.path, secure, String(expiry), c.name, c.value].join("\t"));
  }
  return lines.join("\n") + "\n";
}
