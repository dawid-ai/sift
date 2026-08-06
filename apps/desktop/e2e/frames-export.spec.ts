import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("builds a no-AI document from the transcript + selected slides", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    // Preview → download (gives extract a file) → transcript (the document backbone).
    await window.getByTestId("url-input").fill("https://www.youtube.com/watch?v=fixture");
    await expect(window.getByTestId("preview-card")).toBeVisible();
    await window.getByTestId("download-button").click();
    await expect(window.getByTestId("download-done")).toBeVisible();
    await window.getByTestId("transcript-button").click();
    await expect(window.getByTestId("transcript-panel")).toBeVisible();

    // Open the item, extract slides.
    await window.getByRole("button", { name: "Library" }).click();
    await window.getByTestId("media-open").first().click();
    await window.getByTestId("media-detail-tab-slides").click();
    await window.getByTestId("media-detail-extract-frames").click();
    await expect(window.getByTestId("media-detail-frame")).toHaveCount(2);

    // Export Markdown (deterministic — no PDF binary to assert on) → saved path surfaces.
    await window.getByTestId("media-detail-export-md").click();
    const savedPath = window.getByTestId("media-detail-document-path");
    await expect(savedPath).toBeVisible();
    await expect(savedPath).toContainText(".md");

    // PDF exercises the hidden-window printToPDF path (real Electron main).
    await window.getByTestId("media-detail-export-pdf").click();
    await expect(savedPath).toContainText(".pdf");
    await expect(window.getByTestId("media-detail-action-error")).toHaveCount(0);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
