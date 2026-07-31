import type { Platform } from "./platform";
import type { BinarySource, ResolvedRelease } from "./sources";

/** Pinned Deno release. Bump = new tag + recomputed shas (see the plan's Task 1 Step 1). */
export const DENO_VERSION = "v2.9.2";

const RELEASE_BASE = `https://github.com/denoland/deno/releases/download/${DENO_VERSION}`;

// Per-platform asset name + its pinned sha256 (computed once in Step 1).
// win-arm64 uses Deno's native aarch64 msvc build (distinct asset + sha from win-x64).
const ASSET: Record<Platform, { name: string; sha256: string }> = {
  "win-x64": { name: "deno-x86_64-pc-windows-msvc.zip", sha256: "5fe194d26ac5ef77fcc5288c2c438c7a0465f3b6180440ebf04092714bf2dcdf" },
  "win-arm64": { name: "deno-aarch64-pc-windows-msvc.zip", sha256: "28b57dc03be79ec312ee7baf30678865d84c7cb3764ac7da36e242abea6b3b1d" },
  "mac-x64": { name: "deno-x86_64-apple-darwin.zip", sha256: "c953379e5a85a0a30e99aa51b807633e380e809a1181f53e4904d5fa73785bff" },
  "mac-arm64": { name: "deno-aarch64-apple-darwin.zip", sha256: "687ae485168ba73a4f1ee3a954eb4f077eca82f2fefd236a6a83a3889287876c" },
  "linux-x64": { name: "deno-x86_64-unknown-linux-gnu.zip", sha256: "934d1bd5cb09eaed7f2e4a4fc58208d04a3c5c0fcde9f319d93d735265c67a4a" },
  "linux-arm64": { name: "deno-aarch64-unknown-linux-gnu.zip", sha256: "310b8f48e59964ff18890d35e64f64fb90e8b1cc5d9ebff8c818327d5afb16d2" },
};

export function resolveDeno(p: Platform): ResolvedRelease {
  const entry = ASSET[p];
  return {
    version: DENO_VERSION,
    assetUrl: `${RELEASE_BASE}/${entry.name}`,
    sha256: entry.sha256,
    binaryName: p.startsWith("win") ? "deno.exe" : "deno",
  };
}

export const denoSource: BinarySource = {
  kind: "deno",
  // Pinned + reproducible: no network. fetchImpl is accepted but unused.
  async resolveLatest(p) {
    return resolveDeno(p);
  },
};
