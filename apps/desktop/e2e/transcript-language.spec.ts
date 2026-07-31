import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Settings → Transcript language: adding a language round-trips through the store", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();
    await window.getByRole("button", { name: "Settings" }).click();

    const section = window.getByTestId("transcript-language-section");
    await expect(section).toBeVisible();
    // Default is English only.
    await expect(window.getByTestId("transcript-language-row")).toHaveCount(1);

    // Add Polish.
    await window.getByTestId("transcript-language-input").fill("pl");
    await window.getByTestId("transcript-language-add").click();
    await expect(window.getByTestId("transcript-language-row")).toHaveCount(2);
    await expect(section).toContainText("Polish");
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
