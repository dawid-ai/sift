import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Settings → Diagnostics shows a bundle that carries no user content", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId("db-ready")).toHaveText("db-ok");

    // Put one real item in the library first, so the bundle has something it could leak.
    await window
      .getByTestId("url-input")
      .fill("https://www.youtube.com/watch?v=fixture");
    await expect(window.getByTestId("preview-card")).toBeVisible();
    const title = await window.getByTestId("preview-title").textContent();
    await window.getByTestId("download-button").click();
    await expect(window.getByTestId("download-done")).toBeVisible();

    await window.getByRole("button", { name: "Settings" }).click();
    await window.getByTestId("settings-tab-system").click();
    await window.getByTestId("diagnostics-show").click();

    const preview = window.getByTestId("diagnostics-preview");
    await expect(preview).toBeVisible();
    const text = (await preview.textContent()) ?? "";

    // It reports the shape of the library…
    expect(text).toContain('"media"');
    expect(text).toContain('"secureStorageAvailable"');
    // …and never its contents.
    expect(text).not.toContain("youtube.com/watch");
    if (title?.trim()) expect(text).not.toContain(title.trim());
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
