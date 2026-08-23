import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Ctrl+K navigates, and a pasted URL becomes a fetch", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId("db-ready")).toHaveText("db-ok");

    // Open, filter, and run a navigation command from the keyboard alone.
    await window.keyboard.press("Control+k");
    await expect(window.getByTestId("command-palette")).toBeVisible();
    await window.getByTestId("command-palette-input").fill("queue");
    await window.keyboard.press("Enter");
    await expect(window.getByTestId("command-palette")).toHaveCount(0);
    await expect(window.getByTestId("route-loading")).toHaveCount(0);
    await expect(window.getByTestId("queue-format")).toBeVisible();

    // A URL typed into the palette resolves to "Fetch this URL", which fills Home's field
    // and fetches — from the Queue route, so it also proves the route change.
    await window.keyboard.press("Control+k");
    await window
      .getByTestId("command-palette-input")
      .fill("https://www.youtube.com/watch?v=fixture");
    await window.keyboard.press("Enter");
    await expect(window.getByTestId("preview-card")).toBeVisible();
    await expect(window.getByTestId("url-input")).toHaveValue(
      "https://www.youtube.com/watch?v=fixture",
    );

    // Escape closes without running anything.
    await window.keyboard.press("Control+k");
    await expect(window.getByTestId("command-palette")).toBeVisible();
    await window.keyboard.press("Escape");
    await expect(window.getByTestId("command-palette")).toHaveCount(0);

    // Ctrl+2 is the Library shortcut, and it works with the caret still in Home's field.
    await window.keyboard.press("Control+2");
    await expect(window.getByTestId("route-loading")).toHaveCount(0);
    await expect(window.getByTestId("library-empty")).toBeVisible();
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
