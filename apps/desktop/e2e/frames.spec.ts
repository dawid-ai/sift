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
    // Pin the window to the CI virtual display's 1024x768. The app asks for 1200x800, a
    // runner clamps it, and media detail then falls below the `lg` breakpoint into its
    // stacked, scrolling layout — which is where the crop drag below broke and a local
    // 2560px run could never see it. Other specs still run at the default size; if one of
    // them ever disagrees with CI, this is the first thing to match.
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setSize(1024, 768),
    );

    // Download a fixture video (real tiny mp4 on disk) so frames:extract has a file to read.
    await window
      .getByTestId("url-input")
      .fill("https://www.youtube.com/watch?v=fixture");
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
    await expect(window.getByTestId("media-detail-action-error")).toHaveCount(
      0,
    );

    // The read OCR text is shown, and each thumbnail loads over the sift-frame:// protocol.
    await expect(framesLocator.first()).toContainText("Fixture Slide One");
    const imgSrc = await framesLocator
      .first()
      .locator("img")
      .getAttribute("src");
    expect(imgSrc).toMatch(/^sift-frame:/);

    // Deselecting a frame (include toggle) persists through the setIncluded IPC.
    const firstInclude = framesLocator
      .first()
      .getByTestId("media-detail-frame-include");
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
    // `boundingBox()` reports the full rect even where it runs off the bottom of the
    // viewport, and `mouse.move` takes viewport coordinates and never scrolls — so on the
    // stacked layout the drag was aimed below the fold and landed on nothing.
    await overlay.scrollIntoViewIfNeeded();
    const box = (await overlay.boundingBox())!;
    await window.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await window.mouse.down();
    await window.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, {
      steps: 8,
    });
    await window.mouse.up();
    // Drawing ends edit mode and marks a region (Clear appears).
    await expect(window.getByTestId("media-detail-clear-region")).toBeVisible();
    const outline = window.getByTestId("media-detail-crop-overlay");
    await expect(outline).toBeVisible();

    // The region belongs to the Slides tab — it used to stay painted over the picture on
    // every other tab, with no control in sight to explain or remove it.
    await window.getByTestId("media-detail-tab-transcript").click();
    await expect(outline).toHaveCount(0);
    await window.getByTestId("media-detail-tab-slides").click();
    await expect(outline).toBeVisible();

    // Remove actually removes: the drawn rect used to outlive the drag and shadow the
    // cleared crop, so the box stayed on screen and the button read as a no-op.
    await window.getByTestId("media-detail-clear-region").click();
    await expect(window.getByTestId("media-detail-clear-region")).toHaveCount(
      0,
    );
    await expect(outline).toHaveCount(0);
    // And it stays gone across a remount.
    await window.getByTestId("media-detail-tab-transcript").click();
    await window.getByTestId("media-detail-tab-slides").click();
    await expect(outline).toHaveCount(0);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
