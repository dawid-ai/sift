import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

// Drives the full toast UI offline by injecting simulated update events through the
// dev-only window.sift.updates.simulate bridge (registered because e2e runs unpackaged).
test("update toast: available → download → restart (simulated)", async () => {
  const app = await electron.launch({ args: [join(__dirname, "..", "out", "main", "index.js")] });
  const window = await app.firstWindow();
  await expect(window.getByTestId("db-ready")).toHaveText("db-ok");

  await window.evaluate(() =>
    window.sift.updates.simulate({ type: "available", version: "9.9.9", releaseNotes: "New stuff" }),
  );
  await expect(window.getByTestId("update-toast")).toBeVisible();
  await expect(window.getByTestId("update-toast")).toContainText("9.9.9");

  await window.getByTestId("update-toast-now").click();
  await window.evaluate(() => window.sift.updates.simulate({ type: "downloading", percent: 42 }));
  await expect(window.getByTestId("update-toast-progress")).toBeVisible();

  await window.evaluate(() => window.sift.updates.simulate({ type: "downloaded", version: "9.9.9" }));
  await expect(window.getByTestId("update-toast-restart")).toBeVisible();

  await app.close();
});
