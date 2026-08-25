import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

// Visual regression for the five top-level views, at three widths.
//
// Opt-in, like shots.spec.ts: GPU rasterisation and font hinting differ between machines,
// so a baseline captured on one box red-fails on another for reasons that have nothing to
// do with the change under test. Run it against your own baselines:
//
//   SIFT_VISUAL=1 pnpm --filter @sift/desktop exec playwright test e2e/visual.spec.ts
//   SIFT_VISUAL=1 pnpm --filter @sift/desktop exec playwright test e2e/visual.spec.ts -u
//
// Baselines live in e2e/visual.spec.ts-snapshots/ and are deliberately NOT committed
// (see .gitignore) — they are a local before/after tool, not a shared contract.

const VIEWS = ["Home", "Library", "Queue", "Channels", "Settings"] as const;

/** Narrow, the app's design width, and wide — catches layouts that only hold at one size. */
const SIZES = [
  { name: "narrow", width: 900, height: 800 },
  { name: "default", width: 1280, height: 900 },
  { name: "wide", width: 1800, height: 1000 },
] as const;

for (const size of SIZES) {
  test(`views render consistently at ${size.name} (${size.width}px)`, async () => {
    const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
    const app = await electron.launch({
      args: [join(__dirname, "..", "out", "main", "index.js")],
      env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
    });

    try {
      const window = await app.firstWindow();
      await expect(window.getByTestId("db-ready")).toHaveText("db-ok");
      await window.setViewportSize({ width: size.width, height: size.height });

      for (const view of VIEWS) {
        await window.getByRole("button", { name: view }).click();
        await expect(window.getByTestId("route-loading")).toHaveCount(0);
        await expect(window).toHaveScreenshot(
          `${size.name}-${view.toLowerCase()}.png`,
          {
            // The version string and any in-flight toast change between runs.
            mask: [window.getByTestId("app-version")],
            maxDiffPixelRatio: 0.01,
            animations: "disabled",
          },
        );
      }
    } finally {
      await app.close();
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });
}
