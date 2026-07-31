import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("tag a video in detail → chip in Library → filter", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    // 1. Home → download first (soon-to-be-tagged) row.
    await window.getByTestId("url-input").fill("https://www.youtube.com/watch?v=fixture");
    await expect(window.getByTestId("preview-card")).toBeVisible();
    await window.getByTestId("download-button").click();
    await expect(window.getByTestId("download-done")).toBeVisible();
    await expect(window.getByTestId("home-error")).toHaveCount(0);

    // 2. Library → open detail.
    await window.getByRole("button", { name: "Library" }).click();
    const libraryTable = window.getByTestId("library-table");
    await expect(libraryTable).toBeVisible();
    await expect(window.getByTestId("library-row")).toHaveCount(1);

    await window.getByTestId("media-open").first().click();
    await expect(window.getByTestId("media-detail")).toBeVisible();

    // 3. Tag it "Music" in the detail's tag editor; chip shows in the editor.
    const tagEditor = window.getByTestId("tag-editor");
    await tagEditor.getByTestId("tag-input").fill("Music");
    await tagEditor.getByTestId("tag-input").press("Enter");
    await expect(tagEditor.getByTestId("tag-chip").filter({ hasText: "Music" })).toBeVisible();

    // 4. Back to Library; the row now shows the "Music" chip.
    await window.getByTestId("media-detail-back").click();
    await expect(libraryTable).toBeVisible();
    await expect(libraryTable.getByTestId("tag-chip").filter({ hasText: "Music" })).toBeVisible();

    // 5. Seed a second, untagged row (distinct sourceUrl → distinct media row,
    // even though the fixture yt-dlp stub reports identical canned metadata) so the
    // filter assertion is meaningful: tagged vs untagged.
    await window.getByRole("button", { name: "Home" }).click();
    await window.getByTestId("url-input").fill("https://www.youtube.com/watch?v=fixture-second");
    await expect(window.getByTestId("preview-card")).toBeVisible();
    await window.getByTestId("download-button").click();
    await expect(window.getByTestId("download-done")).toBeVisible();

    await window.getByRole("button", { name: "Library" }).click();
    await expect(libraryTable).toBeVisible();
    await expect(window.getByTestId("library-row")).toHaveCount(2);
    // Only the first row carries the chip.
    await expect(libraryTable.getByTestId("tag-chip").filter({ hasText: "Music" })).toHaveCount(1);

    // 6. Click the chip in the filter bar → only the tagged row remains.
    const filterBar = window.getByTestId("tag-filter-bar");
    await filterBar.getByTestId("tag-chip").filter({ hasText: "Music" }).click();
    await expect(window.getByTestId("library-row")).toHaveCount(1);
    await expect(libraryTable.getByTestId("tag-chip").filter({ hasText: "Music" })).toBeVisible();

    // 7. Clear the filter → the full list is restored.
    await window.getByTestId("tag-filter-clear").click();
    await expect(window.getByTestId("library-row")).toHaveCount(2);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
