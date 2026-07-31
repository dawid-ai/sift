import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("sync subscriptions then import one into My channels", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });
  try {
    const window = await app.firstWindow();
    // exact: true — otherwise this substring-matches other nav/page text.
    await window.getByRole("button", { name: "Channels", exact: true }).click();
    await expect(window.getByTestId("channels-page")).toBeVisible();

    await window.getByTestId("channels-tab-subs").click();
    await window.getByTestId("subscriptions-sync").click();
    await expect(window.getByTestId("subscription-row")).toHaveCount(2);

    // Import the first (Add) → lands focused in My channels, opened straight to its detail.
    await window.getByTestId("subscription-add").first().click();
    await expect(window.getByTestId("channel-detail")).toBeVisible();
    await expect(window.getByText("Sub Alpha")).toBeVisible();
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
