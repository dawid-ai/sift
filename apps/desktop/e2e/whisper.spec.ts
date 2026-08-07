import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Settings → Whisper: offline install flow flips the card to Installed", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    await window.getByRole("button", { name: "Settings" }).click();
    await window.getByTestId("settings-tab-transcription").click();

    const card = window.getByTestId("binary-whisper");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("binary-whisper-status")).not.toContainText("Ready");

    await card.getByTestId("binary-whisper-install").click();

    await expect(card.getByText("Installed")).toBeVisible({ timeout: 15_000 });
    await expect(card.getByTestId("binary-whisper-status")).toContainText("Ready");
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
