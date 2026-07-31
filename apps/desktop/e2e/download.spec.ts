import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Home → download (offline fixture) lands the file and shows up in Library", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    await window.getByTestId("url-input").fill("https://www.youtube.com/watch?v=fixture");

    const previewCard = window.getByTestId("preview-card");
    await expect(previewCard).toBeVisible();

    await window.getByTestId("download-button").click();

    // Progress may flash too fast to catch deterministically (the fixture stub
    // resolves both ticks synchronously) — assert on the terminal state instead
    // of a mid-progress frame.
    await expect(window.getByTestId("download-done")).toBeVisible();
    await expect(window.getByTestId("home-error")).toHaveCount(0);

    await window.getByRole("button", { name: "Library" }).click();

    const libraryTable = window.getByTestId("library-table");
    await expect(libraryTable).toBeVisible();

    const libraryRow = window.getByTestId("library-row").first();
    await expect(libraryRow).toBeVisible();
    await expect(libraryRow).toContainText("Fixture Video Title");
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
