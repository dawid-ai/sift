import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Home → add a tag → download → tag shows in Library", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });
  try {
    const window = await app.firstWindow();
    await window
      .getByTestId("url-input")
      .fill("https://www.youtube.com/watch?v=fixture");
    await expect(window.getByTestId("preview-card")).toBeVisible();

    await window.getByTestId("download-tag-input").fill("e2etag");
    await window.getByTestId("download-tag-input").press("Enter");
    await expect(
      window.locator('[data-testid="tag-chip"][data-tag="e2etag"]'),
    ).toBeVisible();

    await window.getByTestId("download-button").click();
    await expect(window.getByTestId("download-done")).toBeVisible();

    await window.getByRole("button", { name: "Library" }).click();
    await expect(window.getByTestId("library-table")).toBeVisible();
    await expect(
      window.locator('[data-testid="tag-chip"][data-tag="e2etag"]').first(),
    ).toBeVisible();
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
