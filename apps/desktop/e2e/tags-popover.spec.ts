/**
 * Regression guards for the media-detail tag suggestions. Two separate bugs:
 *
 * 1. PLACEMENT. The tag editor is the last card in the left column, so its input sits ~50px above
 *    the bottom of a 900px window. The popover opened downward unconditionally and rendered
 *    853→1081 — 181px below the fold — and three ancestors (`main.lg:overflow-hidden`, the route
 *    scroller, the app shell) all clip at the window edge, so it was cut off, not scrolled past.
 *
 * 2. THE COMMA. The field takes several tags at once, but suggestions matched the whole field, so
 *    "systems, sq" was compared literally against tag names and the popover vanished the moment a
 *    comma was typed. Picking had the same boundary bug — it replaced the field, discarding tags
 *    already typed. Parsing is unit-tested in src/renderer/lib/tag-input.test.ts; this asserts it
 *    is actually wired to the input.
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import electronBinaryPath from "electron";
import { test, expect, _electron as electron } from "@playwright/test";

test("media detail: tag suggestions stay on screen and follow the term after a comma", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-tagpop-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });
  const window = await app.firstWindow();
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900);
  });

  try {
    await window.waitForSelector("h1", { timeout: 30_000 });
    await expect(window.getByTestId("db-ready")).toHaveText("db-ok", {
      timeout: 30_000,
    });

    // Seed tags so the suggestion list has something to show.
    const userDataPath = await app.evaluate(({ app: a }) =>
      a.getPath("userData"),
    );
    execFileSync(
      electronBinaryPath as unknown as string,
      [join(__dirname, "seed-shots.cjs"), join(userDataPath, "sift.db")],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
    );

    await window.getByRole("button", { name: "Library" }).click();
    await window.getByTestId("library-table").waitFor({ timeout: 15_000 });
    await window.getByTestId("media-open").first().click();
    await window.getByTestId("media-detail").waitFor({ timeout: 15_000 });

    const input = window.getByTestId("tag-input");
    await input.click();
    await input.fill("s"); // matches seeded tags: systems, sync, sqlite, css…

    const popover = window.getByTestId("tag-suggestions");
    await expect(popover).toBeVisible();

    const box = await popover.boundingBox();
    const viewportH = await window.evaluate(() => window.innerHeight);
    expect(box).not.toBeNull();

    // The whole popover must be on screen — top below 0, bottom above the window edge.
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewportH);

    // The field takes several tags at once, so suggestions must follow the term after the last
    // comma. Matching the literal "systems, sq" against tag names found nothing and the popover
    // vanished as soon as a comma was typed.
    await input.fill("systems, sq");
    await expect(popover).toBeVisible();
    await expect(popover.getByRole("button", { name: "sqlite" })).toBeVisible();
    // …and the tag already typed one segment to the left is not offered again.
    await expect(
      popover.getByRole("button", { name: "systems", exact: true }),
    ).toHaveCount(0);

    // Picking replaces the term, not the field.
    await popover.getByRole("button", { name: "sqlite" }).click();
    await expect(input).toHaveValue("systems, sqlite");
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
