import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

// Verifies first-run startup maintenance (SIFT_E2E_BINARY_MAINTENANCE=1) installs the missing
// yt-dlp fixture asset and surfaces the ready toast, without needing to click anything —
// mirrors binaries.spec.ts's fixture/launch harness. The ffmpeg fixture is deliberately absent
// (see fixtureSources in main/index.ts): its maintenance run errors, which is fine — this spec
// only asserts the ytdlp card.
test("first-run installs yt-dlp and surfaces the ready toast", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  await writeFile(join(fixtureDir, "yt-dlp"), `fake-yt-dlp-${randomUUID()}`);
  await writeFile(join(fixtureDir, "deno"), `fake-deno-${randomUUID()}`);

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir, SIFT_E2E_BINARY_MAINTENANCE: "1" },
  });

  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId("db-ready")).toHaveText("db-ok");

    const toast = window.getByTestId("binary-update-toast-ytdlp");
    await expect(toast).toBeVisible({ timeout: 15_000 });
    await expect(toast).toContainText(/installed|Updated/);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
