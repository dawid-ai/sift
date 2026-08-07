import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

// The "get transcript after download" toggle (Settings, default on) gates the auto-transcribe
// that runs when a download finishes. On → transcript panel appears; off → it does not.
test("auto-transcript toggle gates transcribe-after-download", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    // Default on: download auto-fetches the transcript → panel shows.
    await window.getByTestId("url-input").fill("https://www.youtube.com/watch?v=fixture");
    await expect(window.getByTestId("preview-card")).toBeVisible();
    await window.getByTestId("download-button").click();
    await expect(window.getByTestId("download-done")).toBeVisible();
    await expect(window.getByTestId("transcript-panel")).toBeVisible();

    // Turn the toggle off in Settings.
    await window.getByRole("button", { name: "Settings" }).click();
    await window.getByTestId("settings-tab-transcription").click();
    const toggle = window.getByTestId("auto-transcript-toggle");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    // Back to Home (remounts), download a different URL → no auto transcript this time.
    await window.getByRole("button", { name: "Home" }).click();
    await window.getByTestId("url-input").fill("https://www.youtube.com/watch?v=fixture-2");
    await expect(window.getByTestId("preview-card")).toBeVisible();
    await window.getByTestId("download-button").click();
    await expect(window.getByTestId("download-done")).toBeVisible();
    await expect(window.getByTestId("transcript-panel")).toHaveCount(0);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
