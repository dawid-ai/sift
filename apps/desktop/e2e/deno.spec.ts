import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Settings → Binaries: Deno offline install flips the card to Installed", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  // yt-dlp fixture too (some specs assume it); write the deno fixture the card installs from.
  await writeFile(join(fixtureDir, "yt-dlp"), `fake-yt-dlp-${randomUUID()}`);
  await writeFile(join(fixtureDir, "deno"), `fake-deno-${randomUUID()}`);

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    await window.getByRole("button", { name: "Settings" }).click();

    const denoRow = window.getByTestId("binary-deno");
    await expect(denoRow).toBeVisible();
    await expect(window.getByTestId("binary-deno-version")).toHaveText("Not installed");

    await denoRow.getByRole("button", { name: "Install" }).click();

    await expect(window.getByTestId("binary-deno-version")).toHaveText("Installed: 9.9.9");
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
