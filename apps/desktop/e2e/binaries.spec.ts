import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Settings → Binaries: offline install flow persists and updates the UI", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  await writeFile(join(fixtureDir, "yt-dlp"), `fake-yt-dlp-${randomUUID()}`);

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    await window.getByRole("button", { name: "Settings" }).click();

    const ytdlpRow = window.getByTestId("binary-ytdlp");
    await expect(ytdlpRow).toBeVisible();
    await expect(window.getByTestId("binary-ytdlp-version")).toHaveText("Not installed");

    await ytdlpRow.getByRole("button", { name: "Install" }).click();

    await expect(window.getByTestId("binary-ytdlp-version")).toHaveText("Installed: 9.9.9");
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
