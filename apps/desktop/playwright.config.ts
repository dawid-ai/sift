import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // shots.spec.ts is a visual-QA capture tool, not a regression spec — it drives every surface
  // and writes PNGs, asserting almost nothing. Left in the default run it padded the suite with
  // ~15s of disk I/O and a test that passes by construction. Opt in to run it:
  //   SIFT_SHOTS=1 pnpm exec playwright test e2e/shots.spec.ts
  // (testIgnore wins over an explicit path argument, hence the env gate rather than a bare glob.)
  testIgnore: process.env.SIFT_SHOTS ? [] : ["**/shots.spec.ts"],
  // Specs share app state (one library db per fixture run), and each launches a real
  // Electron instance. `fullyParallel: false` only serializes *within* a file — without
  // workers:1 Playwright still runs files concurrently and every spec red-fails.
  workers: 1,
  // 60s, not 30s: the frames specs do real ffmpeg/OCR-shaped work through the fixtures and
  // land at 18-29s on a warm machine, i.e. right on a 30s limit under any disk load.
  timeout: 60_000,
  fullyParallel: false,
  reporter: "list",
});
