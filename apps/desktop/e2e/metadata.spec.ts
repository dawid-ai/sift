import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Home → metadata preview + Settings → Platforms render offline via fixture stub", async () => {
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
    await expect(window.getByTestId("preview-title")).toHaveText(
      "Fixture Video Title",
    );
    await expect(window.getByTestId("preview-platform")).toContainText(
      "YouTube",
    );

    await expect(window.getByTestId("home-error")).toHaveCount(0);

    await window.getByRole("button", { name: "Settings" }).click();

    const platformsSection = window.getByTestId("platforms-section");
    await expect(platformsSection).toBeVisible();
    await expect(
      platformsSection.getByTestId("tested-platform").first(),
    ).toBeVisible();
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});

test("a link yt-dlp can't handle shows an error and leaves the app usable", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    await window
      .getByTestId("url-input")
      .fill("https://unsupported.example/shots/1234-promo");

    // The rejected `metadata:fetch` invoke must land in HomeView's catch, not take the
    // window with it — Electron logs handler rejections to the main console either way,
    // which is easy to mistake for a crash.
    const error = window.getByTestId("home-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText("no extractor for unsupported.example");
    await expect(error).not.toContainText("Command failed");
    await expect(window.getByTestId("preview-card")).toHaveCount(0);

    // Still alive: navigate away, and a good URL still previews.
    await window.getByRole("button", { name: "Library" }).click();
    await expect(window.getByTestId("library-empty")).toBeVisible();

    await window.getByRole("button", { name: "Home" }).click();
    await window
      .getByTestId("url-input")
      .fill("https://www.youtube.com/watch?v=fixture");
    await expect(window.getByTestId("preview-title")).toHaveText(
      "Fixture Video Title",
    );
    await expect(window.getByTestId("home-error")).toHaveCount(0);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
