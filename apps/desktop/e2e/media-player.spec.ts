import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("downloaded video renders an in-app player over sift-media", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    // Home → download (mirrors download.spec.ts): the fixture yt-dlp runner writes a real
    // (tiny decodable mp4) file to disk and DownloadService records a "done" download row
    // with that filePath — exactly what the in-app player needs to render a <video> instead
    // of the "Not downloaded yet" poster.
    await window
      .getByTestId("url-input")
      .fill("https://www.youtube.com/watch?v=fixture");

    const previewCard = window.getByTestId("preview-card");
    await expect(previewCard).toBeVisible();

    await window.getByTestId("download-button").click();

    await expect(window.getByTestId("download-done")).toBeVisible();
    await expect(window.getByTestId("home-error")).toHaveCount(0);

    // Library → open the downloaded item's detail page.
    await window.getByRole("button", { name: "Library" }).click();

    const libraryTable = window.getByTestId("library-table");
    await expect(libraryTable).toBeVisible();
    await expect(window.getByTestId("library-row").first()).toBeVisible();

    await window.getByTestId("media-open").first().click();
    await expect(window.getByTestId("media-detail")).toBeVisible();

    // The player must be a real <video> served over sift-media:// — not the poster div
    // shown when there is no downloaded file (both share the media-detail-player testid,
    // so tagName is what actually proves the player path).
    const player = window.getByTestId("media-detail-player");
    await expect(player).toBeVisible();
    await expect(player).toHaveJSProperty("tagName", "VIDEO");

    const src = await player.getAttribute("src");
    expect(src).toMatch(/^sift-media:/);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
