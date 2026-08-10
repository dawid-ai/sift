import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
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
