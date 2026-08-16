import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("importing a local file lands it in the library with a transcript", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const mediaDir = await mkdtemp(join(tmpdir(), "sift-e2e-media-"));
  // Contents don't matter — the fixture whisper provider only requires that a done
  // download row exists, and nothing decodes the file in this spec.
  const mediaPath = join(mediaDir, "Fixture Talk.mp4");
  await writeFile(mediaPath, "not really a video");

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId("db-ready")).toHaveText("db-ok");

    // The drop gesture itself can't be faked (Electron's File.path can't survive a
    // synthetic DataTransfer) — drive the same pipeline the drop handler drives.
    const title = await window.evaluate(async (path) => {
      const record = await window.sift.import.local({ path, durationSec: 61 });
      const metadata = await window.sift.metadata.fetch(record.sourceUrl);
      await window.sift.transcript.get({ metadata });
      return record.title;
    }, mediaPath);

    expect(title).toBe("Fixture Talk");

    // Navigation + row selectors match library-depth.spec.ts.
    await window.getByRole("button", { name: "Library" }).click();
    await expect(window.getByTestId("library-table")).toBeVisible();
    await expect(window.getByTestId("library-row").first()).toBeVisible();
    await expect(window.getByText("Fixture Talk")).toBeVisible();

    await window.getByTestId("media-open").first().click();
    await expect(window.getByTestId("media-detail")).toBeVisible();

    // The Library detail view's transcript tab (default tab) uses its own testids —
    // "transcript-panel"/"transcript-segment" only exist on the Home page's transcript
    // flow (see transcript.spec.ts); this view has no wrapping panel testid and names
    // each row "media-detail-transcript-segment" (routes/library/transcript-panel.tsx).
    await expect(window.getByTestId("media-detail-get-transcript")).toBeVisible();
    await expect(window.getByTestId("media-detail-transcript-segment").first()).toContainText(
      "Fixture whisper line one",
    );
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
    await rm(mediaDir, { recursive: true, force: true });
  }
});
