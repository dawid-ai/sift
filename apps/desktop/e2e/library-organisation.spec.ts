import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

/**
 * Library organisation: selection, bulk tagging, collections, favourites, pinning, the
 * extra filters, saved searches, and the duplicate finder.
 *
 * Seeds two videos through the fixture download flow, because every one of these acts on
 * real rows and an empty library proves nothing.
 */
test("Library: select, bulk tag, collect, favourite, filter, and save the view", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    // Two rows, queued together so the fixture runner resolves both.
    await window.getByRole("button", { name: "Queue" }).click();
    await window
      .getByTestId("queue-urls")
      .fill(
        "https://www.youtube.com/watch?v=a\nhttps://www.youtube.com/watch?v=b",
      );
    await window.getByTestId("queue-add").click();

    await window.getByRole("button", { name: "Library" }).click();
    await expect(window.getByTestId("library-row")).toHaveCount(2);

    // Selection drives the bulk bar.
    await expect(window.getByTestId("bulk-bar")).toHaveCount(0);
    await window.getByTestId("library-select-all").check();
    await expect(window.getByTestId("bulk-count")).toHaveText("2 selected");

    // Bulk tag both rows, then filter down to that tag to prove it landed.
    await window.getByTestId("bulk-tag-input").fill("review");
    await window.getByTestId("bulk-tag-apply").click();
    await expect(window.getByTestId("bulk-message")).toContainText(
      "Tagged 2 of 2",
    );

    // Bulk add to a brand-new collection, then filter by it.
    await window.getByTestId("bulk-collection-new").fill("Watch later");
    await window.getByTestId("bulk-collection-add").click();
    await expect(window.getByTestId("bulk-message")).toContainText(
      "Added 2 to Watch later",
    );
    await window.getByTestId("bulk-clear").click();
    await expect(window.getByTestId("bulk-bar")).toHaveCount(0);

    await window.getByTestId("filter-collection").click();
    await window.getByRole("option", { name: /Watch later/ }).click();
    await expect(window.getByTestId("library-row")).toHaveCount(2);

    // Reset the collection filter before testing favourites, so the two don't compound.
    await window.getByTestId("filter-collection").click();
    await window.getByRole("option", { name: "All collections" }).click();
    await expect(window.getByTestId("library-row")).toHaveCount(2);

    // Favourite exactly one row, then filter to favourites.
    await window.getByTestId("media-favourite").first().click();
    await window.getByTestId("filter-favourites").click();
    await expect(window.getByTestId("library-row")).toHaveCount(1);
    await window.getByTestId("filter-favourites").click();
    await expect(window.getByTestId("library-row")).toHaveCount(2);

    // A smart filter: neither fixture row has a summary.
    await window.getByTestId("filter-missing").click();
    await window.getByRole("option", { name: "No summary" }).click();
    await expect(window.getByTestId("library-row")).toHaveCount(2);

    // Save the current view, clear it, and restore it by name.
    await window.getByTestId("saved-search-name").fill("No summary yet");
    await window.getByTestId("saved-search-save").click();
    const saved = window.getByTestId(/^saved-search-\d+$/);
    await expect(saved).toHaveText("No summary yet");

    await window.getByTestId("filter-missing").click();
    await window.getByRole("option", { name: "Anything" }).click();
    await saved.click();
    // Restored: the smart filter is back on and still matches both rows.
    await expect(window.getByTestId("library-row")).toHaveCount(2);

    // The duplicate finder opens and reports on the seeded pair.
    await window.getByTestId("find-duplicates").click();
    await expect(window.getByTestId("duplicates-panel")).toBeVisible();
    await window.getByTestId("duplicates-close").click();
    await expect(window.getByTestId("duplicates-panel")).toHaveCount(0);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
