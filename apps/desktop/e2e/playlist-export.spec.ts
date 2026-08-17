import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("export the library as an m3u", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    // 1. Home → download (mirrors download.spec.ts exactly) so the Library has one
    // downloaded media to export.
    await window
      .getByTestId("url-input")
      .fill("https://www.youtube.com/watch?v=fixture");

    const previewCard = window.getByTestId("preview-card");
    await expect(previewCard).toBeVisible();

    await window.getByTestId("download-button").click();

    await expect(window.getByTestId("download-done")).toBeVisible();
    await expect(window.getByTestId("home-error")).toHaveCount(0);

    // 2. Library → export.
    await window.getByRole("button", { name: "Library" }).click();

    const libraryTable = window.getByTestId("library-table");
    await expect(libraryTable).toBeVisible();
    await expect(window.getByTestId("library-row")).toHaveCount(1);

    await window.getByTestId("export-m3u").click();

    const exportResultEl = window.getByTestId("playlist-export-result");
    await expect(exportResultEl).toBeVisible();
    await expect(exportResultEl).toContainText("Exported 1 video");

    // 3. Find the downloaded file's real on-disk path via the same IPC the Library
    // list reads from (window.sift.library.list(), exposed to the renderer's main
    // world via contextBridge — reachable from page.evaluate). The export's downloads
    // dir is a sibling of that path (`<downloadsDir>/<file>`), and with no active tag
    // or channel filter the export name defaults to "sift-library" (see
    // library-page.tsx's handleExportM3U).
    const items = await window.evaluate(() => window.sift.library.list());
    expect(items).toHaveLength(1);
    const downloadPath = items[0]!.media.downloadPath;
    expect(downloadPath).toBeTruthy();

    const m3uPath = join(
      dirname(downloadPath!),
      "playlists",
      "sift-library.m3u",
    );
    const content = await readFile(m3uPath, "utf8");

    expect(content.startsWith("#EXTM3U")).toBe(true);
    expect(content).toContain(downloadPath);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
