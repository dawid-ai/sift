import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Home → transcript (offline fixture) parses captions into the transcript panel", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    await window.getByTestId("url-input").fill("https://www.youtube.com/watch?v=fixture");

    const previewCard = window.getByTestId("preview-card");
    await expect(previewCard).toBeVisible();

    await window.getByTestId("transcript-button").click();

    // Fetch + parse resolve synchronously in the fixture stub — assert on the
    // terminal state instead of a mid-flight frame, matching download.spec.ts.
    const transcriptPanel = window.getByTestId("transcript-panel");
    await expect(transcriptPanel).toBeVisible();

    const firstSegment = transcriptPanel.getByTestId("transcript-segment").first();
    await expect(firstSegment).toContainText("Fixture caption line one");

    await expect(window.getByTestId("transcript-error")).toHaveCount(0);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
