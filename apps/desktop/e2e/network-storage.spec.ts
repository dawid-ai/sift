import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

/**
 * Settings → System: the proxy field and the storage dashboard.
 *
 * The clear buttons and the profile export/import both open native dialogs, which Playwright
 * can't drive here — those stay in `docs/TEST-MATRIX.md`. What this does cover is that the
 * proxy value survives a round trip through the real store and that a bad one is refused with
 * the message from main rather than being written.
 */
test("Settings → System: proxy round-trips and rejects a bad URL; storage lists sizes", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();
    await window.getByRole("button", { name: "Settings" }).click();
    await window.getByTestId("settings-tab-system").click();

    const network = window.getByTestId("network-section");
    await expect(network).toBeVisible();

    // A bad scheme is refused by the store, and the field keeps what the user typed.
    await window.getByTestId("proxy-input").fill("ftp://nope");
    await window.getByTestId("proxy-save").click();
    await expect(network).toContainText("Proxy scheme must be one of");
    await expect(window.getByTestId("proxy-active")).toHaveCount(0);

    // A good one is normalized, stored, and reported as active.
    await window.getByTestId("proxy-input").fill("http://127.0.0.1:8080/path");
    await window.getByTestId("proxy-save").click();
    await expect(window.getByTestId("proxy-active")).toBeVisible();
    await expect(window.getByTestId("proxy-input")).toHaveValue(
      "http://127.0.0.1:8080",
    );
    // Saved, so the button goes back to disabled — nothing left to apply.
    await expect(window.getByTestId("proxy-save")).toBeDisabled();

    // Clearing it round-trips too.
    await window.getByTestId("proxy-input").fill("");
    await window.getByTestId("proxy-save").click();
    await expect(window.getByTestId("proxy-active")).toHaveCount(0);

    // Storage: every category reports a size, and the empty fixture install has no media.
    const storage = window.getByTestId("storage-section");
    await expect(storage).toBeVisible();
    await expect(window.getByTestId("storage-bytes-media")).toHaveText("0 B");
    await expect(window.getByTestId("storage-bytes-frames")).toBeVisible();
    await expect(window.getByTestId("storage-total")).toContainText("in use");
    // Nothing to clear on a fresh install, so no Clear button is offered.
    await expect(window.getByTestId("storage-clear-thumbnails")).toHaveCount(0);

    // The profile controls render and are enabled; the dialogs themselves are manual.
    await expect(window.getByTestId("profile-export")).toBeEnabled();
    await expect(window.getByTestId("profile-import")).toBeEnabled();
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
