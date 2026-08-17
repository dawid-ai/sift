import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import electronBinaryPath from "electron";
import { test, expect, _electron as electron } from "@playwright/test";

// Seeds 130 rows straight into the app's sqlite (default 24/page → 6 pages) and drives the
// numbered pager, jump-to-page, and per-page size. See seed-many.cjs for why seeding is
// out-of-process.
test("library paginates: result count, numbered pages, prev/next, jump, page size", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();
    // Wait for the app (and its DB migrations) to be ready before seeding.
    await expect(window.getByTestId("db-ready")).toHaveText("db-ok");

    const userDataPath = await app.evaluate(({ app: electronApp }) =>
      electronApp.getPath("userData"),
    );
    execFileSync(
      electronBinaryPath as unknown as string,
      [join(__dirname, "seed-many.cjs"), join(userDataPath, "sift.db"), "130"],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      },
    );

    await window.getByRole("button", { name: "Library" }).click();
    await window.getByTestId("library-view-table").click();

    // Page 1 of 6 (default 24/page): 24 rows, range + pager present.
    await expect(window.getByTestId("library-row")).toHaveCount(24);
    await expect(window.getByTestId("library-result-count")).toHaveText(
      "Showing 1–24 of 130",
    );
    await expect(window.getByTestId("library-pager")).toBeVisible();
    await expect(window.getByTestId("library-page-6")).toBeVisible();

    // Next → page 2: range updates, prev now enabled.
    await window.getByTestId("library-page-next").click();
    await expect(window.getByTestId("library-result-count")).toHaveText(
      "Showing 25–48 of 130",
    );
    await expect(window.getByTestId("library-page-prev")).toBeEnabled();
    await expect(window.getByTestId("library-page-2")).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Last → page 6: 10 remaining rows, next + last disabled.
    await window.getByTestId("library-page-last").click();
    await expect(window.getByTestId("library-row")).toHaveCount(10);
    await expect(window.getByTestId("library-result-count")).toHaveText(
      "Showing 121–130 of 130",
    );
    await expect(window.getByTestId("library-page-next")).toBeDisabled();
    await expect(window.getByTestId("library-page-last")).toBeDisabled();

    // First → back to page 1, first + prev disabled.
    await window.getByTestId("library-page-first").click();
    await expect(window.getByTestId("library-result-count")).toHaveText(
      "Showing 1–24 of 130",
    );
    await expect(window.getByTestId("library-page-first")).toBeDisabled();
    await expect(window.getByTestId("library-page-prev")).toBeDisabled();

    // Jump input still works: to the last page.
    await window.getByTestId("library-page-jump").fill("6");
    await window.getByTestId("library-page-jump").press("Enter");
    await expect(window.getByTestId("library-result-count")).toHaveText(
      "Showing 121–130 of 130",
    );

    // Change page size to 200 → everything on one page, pager (and jump) gone.
    await window.getByTestId("library-page-size").selectOption("200");
    await expect(window.getByTestId("library-row")).toHaveCount(130);
    await expect(window.getByTestId("library-result-count")).toHaveText(
      "Showing 1–130 of 130",
    );
    await expect(window.getByTestId("library-pager")).toHaveCount(0);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
