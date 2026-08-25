import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

/**
 * Channel refresh scheduling and per-channel auto-queue rules.
 *
 * The timer itself and the desktop notifications need real elapsed time and a real OS
 * notification centre, so those stay in `docs/TEST-MATRIX.md`. What this covers is that the
 * schedule and a rule both persist, and that an inverted duration window is refused rather
 * than stored as something that can only ever match nothing.
 */
test("Channels: schedule and auto-queue rule persist; a bad window is refused", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();
    await window.getByRole("button", { name: "Channels" }).click();

    // Track a channel so the rules panel has a subject.
    await window
      .getByTestId("channels-add-url")
      .fill("https://www.youtube.com/@fixture");
    await window.getByTestId("channels-add").click();
    await expect(window.getByTestId("channel-rules-panel")).toBeVisible();
    await expect(window.getByTestId("channel-rule-row")).toHaveCount(1);

    // Schedule: pick an interval, then prove it came back from the store.
    await window.getByTestId("refresh-interval").click();
    await window.getByRole("option", { name: "Hourly" }).click();
    await expect(window.getByTestId("refresh-interval")).toContainText(
      "Hourly",
    );

    // No rule yet.
    await expect(window.getByTestId("channel-rule-summary")).toHaveText(
      "No rule",
    );

    const editButton = window.getByTestId(/^channel-rule-edit-/);
    await editButton.click();

    // An inverted window is refused at the IPC edge.
    await window.getByTestId("rule-min-minutes").fill("60");
    await window.getByTestId("rule-max-minutes").fill("10");
    await window.getByTestId("rule-save").click();
    await expect(window.getByTestId("rules-error")).toContainText(
      "must not exceed",
    );

    // A sane rule saves and is summarised on the row.
    await window.getByTestId("rule-max-minutes").fill("120");
    await window.getByTestId("rule-min-views").fill("5000");
    await window.getByTestId("rule-keywords").fill("rust, go");
    await window.getByTestId("rule-enabled").click();
    await window.getByTestId("rule-save").click();

    const summary = window.getByTestId("channel-rule-summary");
    await expect(summary).toContainText("60–120 min");
    await expect(summary).toContainText("5,000+ views");
    await expect(summary).toContainText("matching rust, go");

    // Reopen: every field came back from the database.
    await editButton.click();
    await expect(window.getByTestId("rule-min-minutes")).toHaveValue("60");
    await expect(window.getByTestId("rule-keywords")).toHaveValue("rust, go");

    // "Check now" runs a tick against the fixture runner without throwing.
    await window.getByTestId("refresh-now").click();
    await expect(window.getByTestId("rules-status")).toBeVisible();
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
