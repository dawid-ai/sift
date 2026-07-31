import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

// No Ollama runs in CI, so the real ollama:health ping to localhost:11434 fails →
// the not-running panel must appear instead of a summary starting.
test("Home → summarize with Ollama (not running) shows the start/recheck panel", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });
  try {
    const window = await app.firstWindow();
    await window.getByTestId("url-input").fill("https://www.youtube.com/watch?v=fixture");
    await expect(window.getByTestId("preview-card")).toBeVisible();

    await window.getByTestId("summary-provider").selectOption("ollama");
    await window.getByTestId("transcript-button").click();
    await expect(window.getByTestId("summarize-button")).toBeEnabled({ timeout: 15000 });

    await window.getByTestId("summarize-button").click();
    await expect(window.getByTestId("ollama-down-panel")).toBeVisible();
    await expect(window.getByTestId("ollama-start")).toBeVisible();
    await expect(window.getByTestId("ollama-recheck")).toBeVisible();
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
