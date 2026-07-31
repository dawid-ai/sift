import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Library table/tiles + detail downloads + remove (offline fixture)", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    // 1. Home → download (mirrors download.spec.ts exactly, so a media row
    // exists before the Library assertions below).
    await window.getByTestId("url-input").fill("https://www.youtube.com/watch?v=fixture");

    const previewCard = window.getByTestId("preview-card");
    await expect(previewCard).toBeVisible();

    await window.getByTestId("download-button").click();

    await expect(window.getByTestId("download-done")).toBeVisible();
    await expect(window.getByTestId("home-error")).toHaveCount(0);

    // 2. Go to Library (table by default), open detail.
    await window.getByRole("button", { name: "Library" }).click();

    const libraryTable = window.getByTestId("library-table");
    await expect(libraryTable).toBeVisible();
    await expect(window.getByTestId("library-row").first()).toBeVisible();

    await window.getByTestId("media-open").first().click();
    await expect(window.getByTestId("media-detail")).toBeVisible();
    await expect(window.getByTestId("media-detail-title")).toBeVisible();
    // Header renders the original source link (opens externally; not clicked here to
    // avoid launching a real browser via shell.openExternal).
    await expect(window.getByTestId("media-detail-source")).toBeVisible();
    await expect(window.getByTestId("media-detail-open-source")).toBeVisible();
    // In-detail actions: pull a transcript (if missing) and run a prompt. (The round-trip
    // is covered by transcript.spec/summarize.spec from Home; here we just assert wiring.)
    // Transcript is the default tab; Summary/Files content lives behind their tabs.
    await expect(window.getByTestId("media-detail-get-transcript")).toBeVisible();
    await window.getByTestId("media-detail-tab-summary").click();
    await expect(window.getByTestId("media-detail-summarize")).toBeVisible();
    await expect(window.getByTestId("media-detail-summary-provider")).toBeVisible();

    // 3. The fixture download shows up as a Files entry in the detail view;
    // removing it clears the tab.
    await window.getByTestId("media-detail-tab-files").click();
    await expect(window.getByTestId("media-detail-download")).toHaveCount(1);
    await window.getByTestId("media-detail-download-remove").click();
    await expect(window.getByTestId("media-detail-download")).toHaveCount(0);
    await expect(window.getByText("No files yet.", { exact: false })).toBeVisible();

    // 4. Back to library list. Exercise the Tiles/Table toggle.
    await window.getByTestId("media-detail-back").click();
    await expect(libraryTable).toBeVisible();

    await window.getByTestId("library-view-tiles").click();
    await expect(window.getByTestId("library-grid")).toBeVisible();

    await window.getByTestId("library-view-table").click();
    await expect(libraryTable).toBeVisible();

    // 5. Remove the media entirely, confirm → empty.
    await window.getByTestId("media-remove").first().click();
    await window.getByTestId("media-remove-confirm").click();
    await expect(window.getByTestId("library-empty")).toBeVisible();
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
