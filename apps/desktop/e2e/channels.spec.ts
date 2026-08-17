import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Channels → add → detail → get videos → add selected to queue", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });
  try {
    const window = await app.firstWindow();
    await window.getByRole("button", { name: "Channels" }).click();
    await expect(window.getByTestId("channels-page")).toBeVisible();

    await window
      .getByTestId("channels-add-url")
      .fill("https://www.youtube.com/@fixture");
    await window.getByTestId("channels-add").click();
    const row = window.getByTestId("channel-row").first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("Fixture Channel");

    await row.getByText("Fixture Channel").click();
    await expect(window.getByTestId("channel-detail")).toBeVisible();
    await window.getByTestId("channel-get-videos").click();
    await expect(window.getByTestId("channel-video").first()).toBeVisible();

    await window.getByTestId("channel-select-all").click();
    await window.getByTestId("channel-add-to-queue").click();

    // The queued videos drain (fixture succeeds) and a fully-successful item auto-clears from
    // the queue, so verify the end-state: the video landed in the Library.
    await window.getByRole("button", { name: "Library" }).click();
    await expect(window.getByTestId("library-table")).toBeVisible();
    await expect(window.getByTestId("library-row").first()).toContainText(
      "Fixture Video Title",
      { timeout: 15000 },
    );
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
