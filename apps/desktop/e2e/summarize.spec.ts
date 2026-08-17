import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Home → transcript → summarize (offline fixture) streams and stores a summary", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    await window
      .getByTestId("url-input")
      .fill("https://www.youtube.com/watch?v=fixture");

    const previewCard = window.getByTestId("preview-card");
    await expect(previewCard).toBeVisible();

    await window.getByTestId("transcript-button").click();

    const transcriptPanel = window.getByTestId("transcript-panel");
    await expect(transcriptPanel).toBeVisible();

    // A transcript must exist before summarize is enabled. With no keys set, the
    // default provider is the keyless fixture Ollama provider (which returns the
    // canned FIXTURE_SUMMARY), so the summarize runs offline.
    await window.getByTestId("summarize-button").click();

    // Streaming resolves synchronously in the fixture stub — assert on the terminal
    // state instead of a mid-flight frame, matching transcript.spec.ts.
    const summaryPanel = window.getByTestId("summary-panel");
    await expect(summaryPanel).toBeVisible();

    const summaryContent = window.getByTestId("summary-content");
    await expect(summaryContent).toContainText("Fixture summary");

    await expect(window.getByTestId("summary-error")).toHaveCount(0);

    await window.getByTestId("summary-export").click();
    await expect(window.getByTestId("summary-export-path")).toBeVisible();
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
