import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("app window renders name and version", async () => {
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
  });
  const window = await app.firstWindow();
  await expect(window.locator("h1")).toHaveText("Sift");
  // Must match the RESOLVED version (e.g. "v0.0.1"), not the "v…" placeholder.
  await expect(window.getByTestId("app-version")).toHaveText(/^v\d/);
  await expect(window.getByTestId("db-ready")).toHaveText("db-ok");
  await app.close();
});
