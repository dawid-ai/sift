// apps/desktop/src/main/auth/netscape.test.ts
import { describe, expect, it } from "vitest";
import { toNetscapeCookies } from "./netscape";

describe("toNetscapeCookies", () => {
  it("emits the Netscape header", () => {
    expect(toNetscapeCookies([]).split("\n")[0]).toBe(
      "# Netscape HTTP Cookie File",
    );
  });

  it("formats a dated, secure, subdomain cookie as TAB-separated fields", () => {
    const out = toNetscapeCookies([
      {
        domain: ".youtube.com",
        path: "/",
        secure: true,
        expirationDate: 1893456000,
        name: "SID",
        value: "abc",
      },
    ]);
    const line = out.trimEnd().split("\n").at(-1);
    expect(line).toBe(".youtube.com\tTRUE\t/\tTRUE\t1893456000\tSID\tabc");
  });

  it("host-only (no leading dot) → include-subdomains FALSE; session cookie → expiry 0; not secure → FALSE", () => {
    const out = toNetscapeCookies([
      {
        domain: "youtube.com",
        path: "/watch",
        secure: false,
        name: "PREF",
        value: "x",
      },
    ]);
    const line = out.trimEnd().split("\n").at(-1);
    expect(line).toBe("youtube.com\tFALSE\t/watch\tFALSE\t0\tPREF\tx");
  });

  it("rounds a fractional expirationDate to an integer", () => {
    const out = toNetscapeCookies([
      {
        domain: "a.com",
        path: "/",
        secure: false,
        expirationDate: 1700000000.9,
        name: "n",
        value: "v",
      },
    ]);
    expect(out.trimEnd().split("\n").at(-1)).toContain("\t1700000000\t");
  });
});
