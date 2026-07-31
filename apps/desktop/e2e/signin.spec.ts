import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Settings → Sign-in browser lists a signed-in site and removes it (offline fake)", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });
  try {
    const window = await app.firstWindow();
    await window.getByRole("button", { name: "Settings" }).click();
    const section = window.getByTestId("signin-section");
    await expect(section).toBeVisible();
    await expect(window.getByTestId("signin-open-browser")).toBeVisible();
    // Fixture jar is seeded signed-in with youtube.com.
    await expect(window.getByTestId("signin-site-row")).toHaveCount(1);
    await expect(section).toContainText("youtube.com");
    // Remove clears it.
    await window.getByTestId("signin-site-remove").click();
    await expect(window.getByTestId("signin-site-row")).toHaveCount(0);
    await expect(section).toContainText("No signed-in sites yet.");
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
