import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

// After a video is captured, re-entering its URL shows "already in library" widgets, and
// clicking Download asks for confirmation before re-downloading.
test("re-entering a captured URL shows widgets and confirms re-download", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();
    const url = "https://www.youtube.com/watch?v=fixture";

    // First capture: download (default auto-transcribe stores a transcript too).
    await window.getByTestId("url-input").fill(url);
    await expect(window.getByTestId("preview-card")).toBeVisible();
    await window.getByTestId("download-button").click();
    await expect(window.getByTestId("download-done")).toBeVisible();
    await expect(window.getByTestId("transcript-panel")).toBeVisible();

    // Remount Home, then re-enter the same URL → existing-item lookup finds it.
    await window.getByRole("button", { name: "Library" }).click();
    await expect(window.getByTestId("library-row")).toHaveCount(1);
    await window.getByRole("button", { name: "Home" }).click();
    await window.getByTestId("url-input").fill(url);
    await expect(window.getByTestId("preview-card")).toBeVisible();

    // Widgets: downloaded video + transcript.
    await expect(window.getByTestId("already-captured")).toBeVisible();
    await expect(window.getByTestId("captured-video")).toBeVisible();
    await expect(window.getByTestId("captured-transcript")).toBeVisible();
    await expect(window.getByTestId("download-button")).toContainText(
      "Re-download",
    );

    // Clicking Download asks first; Cancel dismisses without downloading.
    await window.getByTestId("download-button").click();
    await expect(window.getByTestId("redownload-confirm")).toBeVisible();
    await window.getByTestId("confirm-cancel").click();
    await expect(window.getByTestId("redownload-confirm")).toHaveCount(0);

    // Clicking again and confirming proceeds with the re-download.
    await window.getByTestId("download-button").click();
    await expect(window.getByTestId("redownload-confirm")).toBeVisible();
    await window.getByTestId("confirm-ok").click();
    await expect(window.getByTestId("redownload-confirm")).toHaveCount(0);
    await expect(window.getByTestId("download-done")).toBeVisible();
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
