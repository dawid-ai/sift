import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import electronBinaryPath from "electron";
import { test, expect, _electron as electron } from "@playwright/test";

test("search filters the library and shows a snippet", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    // 1. Home → download two rows via distinct source_urls (mirrors tags.spec.ts's
    // two-row setup: the fixture yt-dlp stub reports identical canned metadata for
    // any URL, so a distinct source_url is what makes these two separate media rows).
    await window
      .getByTestId("url-input")
      .fill("https://www.youtube.com/watch?v=fixture");
    await expect(window.getByTestId("preview-card")).toBeVisible();
    await window.getByTestId("download-button").click();
    await expect(window.getByTestId("download-done")).toBeVisible();

    // HomeView must remount (navigate away and back) before entering the second URL — its
    // request-id/metadata state otherwise stays pinned to the first video (same as
    // tags.spec.ts's step 5, which routes through Library before returning to Home).
    await window.getByRole("button", { name: "Library" }).click();
    await expect(window.getByTestId("library-row")).toHaveCount(1);
    await window.getByRole("button", { name: "Home" }).click();

    await window
      .getByTestId("url-input")
      .fill("https://www.youtube.com/watch?v=fixture-second");
    await expect(window.getByTestId("preview-card")).toBeVisible();
    await window.getByTestId("download-button").click();
    await expect(window.getByTestId("download-done")).toBeVisible();

    // The offline fixture serves identical canned metadata/subtitle text for every URL
    // (FIXTURE_METADATA_JSON / FIXTURE_VTT in main/index.ts), so there is no UI path to
    // give one row a transcript the other lacks, or to give the two rows different
    // uploaders (needed to make the channel filter actually narrow anything). No such
    // seed path exists yet, so — per the brief — this seeds the missing data directly
    // via seed-search-fixture.cjs (see that file for why: electronApplication.evaluate()
    // has no require/dynamic-import, and this repo's better-sqlite3 is built against
    // Electron's Node ABI, so a plain Node process can't load it either). No app source
    // is touched — this only opens the app's own sqlite file from outside it.
    const userDataPath = await app.evaluate(({ app: electronApp }) =>
      electronApp.getPath("userData"),
    );
    execFileSync(
      electronBinaryPath as unknown as string,
      [
        join(__dirname, "seed-search-fixture.cjs"),
        join(userDataPath, "sift.db"),
        "https://www.youtube.com/watch?v=fixture",
        "https://www.youtube.com/watch?v=fixture-second",
        "In this video we discuss the process of photosynthesis in great detail throughout.",
        "Other Channel",
      ],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
    );

    // 2. Library: both rows show.
    await window.getByRole("button", { name: "Library" }).click();
    const libraryTable = window.getByTestId("library-table");
    await expect(libraryTable).toBeVisible();
    await expect(window.getByTestId("library-row")).toHaveCount(2);

    // 3. Type the unique transcript word into the search box. It appears only in
    //    the transcript, so with the box in its default title-and-channel mode it
    //    must find nothing -- assert that first, then switch transcript search on.
    await window.getByTestId("library-search-input").fill("photosynthesis");
    await expect(window.getByTestId("library-row")).toHaveCount(0);

    await window.getByTestId("library-search-text-toggle").click();

    // 4. Search is debounced (~200ms) + async — wait for the terminal state via
    // auto-retrying assertions rather than a fixed sleep. Only the seeded row remains,
    // with a snippet containing the term inside a <mark>.
    await expect(window.getByTestId("library-row")).toHaveCount(1);
    const snippet = window.getByTestId("search-snippet");
    await expect(snippet).toBeVisible();
    await expect(snippet).toContainText("photosynthesis");
    await expect(snippet.locator("mark")).toContainText("photosynthesis");

    // 5. Clear the search → both rows return.
    await window.getByTestId("library-search-input").fill("");
    await expect(window.getByTestId("library-row")).toHaveCount(2);

    // 6. Channel filter: open the dropdown, type to narrow the option list down to the
    //    untouched row's uploader, pick it, then reopen and reset to "All channels".
    const channelFilter = window.getByTestId("library-channel-filter");
    const channelOptions = window.getByTestId("library-channel-filter-option");
    await channelFilter.click();
    await window.getByTestId("library-channel-filter-search").fill("Fixture");
    await expect(channelOptions).toHaveCount(1); // "All channels" filtered out too
    await channelOptions.click();
    await expect(window.getByTestId("library-row")).toHaveCount(1);
    await expect(libraryTable).toContainText("Fixture Channel");
    await expect(libraryTable).not.toContainText("Other Channel");

    await channelFilter.click();
    await channelOptions.filter({ hasText: "All channels" }).click();
    await expect(window.getByTestId("library-row")).toHaveCount(2);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
