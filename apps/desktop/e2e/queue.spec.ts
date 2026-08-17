import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Queue → add with download+transcript succeeds, auto-clears, and appears in Library", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });
  try {
    const window = await app.firstWindow();
    await window.getByRole("button", { name: "Queue" }).click();
    await expect(window.getByTestId("queue-page")).toBeVisible();

    await window
      .getByTestId("queue-urls")
      .fill("https://www.youtube.com/watch?v=fixture");
    await window.getByTestId("queue-op-transcript").check();
    await window.getByTestId("queue-add").click();

    // Fixture download + transcript both succeed with no errors → the item auto-clears.
    await expect(window.getByTestId("queue-item")).toHaveCount(0, {
      timeout: 15000,
    });

    // The processed video is now in the Library.
    await window.getByRole("button", { name: "Library" }).click();
    await expect(window.getByTestId("library-table")).toBeVisible();
    await expect(window.getByTestId("library-row").first()).toContainText(
      "Fixture Video Title",
    );
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});

test("Queue → add two, reorder, remove", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });
  try {
    const window = await app.firstWindow();
    await window.getByRole("button", { name: "Queue" }).click();
    // Pause first so items don't drain before we can reorder/remove them.
    await window.getByTestId("queue-pause").click();
    await window.getByTestId("queue-urls").fill("https://x/a\nhttps://x/b");
    await window.getByTestId("queue-add").click();

    const items = window.getByTestId("queue-item");
    await expect(items).toHaveCount(2);
    await items.first().getByTestId("queue-item-remove").click();
    await expect(window.getByTestId("queue-item")).toHaveCount(1);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
