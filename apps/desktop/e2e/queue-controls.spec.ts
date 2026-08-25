import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Queue → duplicate URLs are skipped and reported", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId("db-ready")).toHaveText("db-ok");
    await window.getByRole("button", { name: "Queue" }).click();
    await expect(window.getByTestId("route-loading")).toHaveCount(0);

    // Paused, so items stay put long enough to be duplicated. The fixture runners resolve
    // synchronously, so an active queue would drain a batch before the second add lands.
    await window.getByTestId("queue-pause").click();

    await window
      .getByTestId("queue-urls")
      .fill("https://www.youtube.com/watch?v=a\nhttps://www.youtube.com/watch?v=b");
    await window.getByTestId("queue-add").click();
    await expect(window.getByTestId("queue-item")).toHaveCount(2);

    await window
      .getByTestId("queue-urls")
      .fill("https://www.youtube.com/watch?v=b\nhttps://www.youtube.com/watch?v=c");
    await window.getByTestId("queue-add").click();

    await expect(window.getByTestId("queue-notice")).toContainText(
      "Skipped 1 URL already in the queue",
    );
    await expect(window.getByTestId("queue-item")).toHaveCount(3);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});

test("Queue → concurrency and scheduled start persist", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId("db-ready")).toHaveText("db-ok");
    await window.getByRole("button", { name: "Queue" }).click();
    await expect(window.getByTestId("route-loading")).toHaveCount(0);

    await window.getByTestId("queue-concurrency").selectOption("3");
    // Round-trips through the main process, so re-reading proves it was stored.
    await expect
      .poll(async () =>
        window.evaluate(async () => (await window.sift.queue.getConfig()).concurrency),
      )
      .toBe(3);

    await window.getByTestId("queue-start-at").fill("03:30");
    await expect(window.getByTestId("queue-scheduled")).toBeVisible();
    // Scheduling pauses the drain until the time arrives.
    await expect(window.getByTestId("queue-pause")).toContainText("Resume");

    await window.getByTestId("queue-clear-schedule").click();
    await expect(window.getByTestId("queue-scheduled")).toHaveCount(0);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
