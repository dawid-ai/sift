import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("extracts slide frames from a downloaded video and shows them", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    // Download a fixture video (real tiny mp4 on disk) so frames:extract has a file to read.
    await window.getByTestId("url-input").fill("https://www.youtube.com/watch?v=fixture");
    await expect(window.getByTestId("preview-card")).toBeVisible();
    await window.getByTestId("download-button").click();
    await expect(window.getByTestId("download-done")).toBeVisible();

    // Open the item's detail page.
    await window.getByRole("button", { name: "Library" }).click();
    await expect(window.getByTestId("library-table")).toBeVisible();
    await window.getByTestId("media-open").first().click();
    await expect(window.getByTestId("media-detail")).toBeVisible();

    // Slides tab → empty state until extraction runs.
    await window.getByTestId("media-detail-tab-slides").click();
    await expect(window.getByTestId("media-detail-frames-empty")).toBeVisible();

    // Extract: the fixture frame service yields two canned slides.
    await window.getByTestId("media-detail-extract-frames").click();

    const framesLocator = window.getByTestId("media-detail-frame");
    await expect(framesLocator).toHaveCount(2);
    await expect(window.getByTestId("media-detail-action-error")).toHaveCount(0);

    // The read OCR text is shown, and each thumbnail loads over the sift-frame:// protocol.
    await expect(framesLocator.first()).toContainText("Fixture Slide One");
    const imgSrc = await framesLocator.first().locator("img").getAttribute("src");
    expect(imgSrc).toMatch(/^sift-frame:/);

    // Deselecting a frame (include toggle) persists through the setIncluded IPC.
    const firstInclude = framesLocator.first().getByTestId("media-detail-frame-include");
    await expect(firstInclude).toBeChecked();
    await firstInclude.uncheck();
    await expect(firstInclude).not.toBeChecked();

    // Right-clicking the card toggles include too (no hunting for the checkbox).
    await framesLocator.first().click({ button: "right" });
    await expect(firstInclude).toBeChecked();

    // Manual capture at the current playhead adds a third (manual) frame.
    await window.getByTestId("media-detail-capture-frame").click();
    await expect(framesLocator).toHaveCount(3);
    await expect(window.getByText("· manual")).toBeVisible();

    // Slide-region crop: enter edit mode, drag a box over the video, and the crop persists.
    await window.getByTestId("media-detail-set-region").click();
    const overlay = window.getByTestId("media-detail-crop-overlay");
    await expect(overlay).toBeVisible();
    const box = (await overlay.boundingBox())!;
    await window.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await window.mouse.down();
    await window.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 8 });
    await window.mouse.up();
    // Drawing ends edit mode and marks a region (Clear appears).
    await expect(window.getByTestId("media-detail-clear-region")).toBeVisible();
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
