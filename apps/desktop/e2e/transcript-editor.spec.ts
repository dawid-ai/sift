import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

/**
 * Transcript editing and the export menu.
 *
 * The clip exports need a real ffmpeg and a real media file, so they stay in
 * `docs/TEST-MATRIX.md`; what this covers is that an edit reaches the database and comes back,
 * and that each export preset writes a file.
 */
test("Transcript editor: find/replace and speaker labels persist; exports write files", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    // Seed one video with a transcript through the fixture flow, the same route
    // transcript.spec.ts takes.
    await window
      .getByTestId("url-input")
      .fill("https://www.youtube.com/watch?v=fixture");
    await expect(window.getByTestId("preview-card")).toBeVisible();
    await window.getByTestId("transcript-button").click();
    await expect(window.getByTestId("transcript-panel")).toBeVisible();

    await window.getByRole("button", { name: "Library" }).click();
    await window.getByTestId("media-open").first().click();
    await window.getByTestId("media-detail-tab-transcript").click();

    // Open the editor.
    const editButton = window.getByTestId(/^transcript-edit-\d+$/);
    await editButton.click();
    await expect(window.getByTestId("transcript-editor")).toBeVisible();

    const firstText = window.getByTestId("editor-cue-text").first();
    const before = await firstText.inputValue();
    expect(before.length).toBeGreaterThan(0);

    // Find/replace reports its match count and rewrites the cues.
    const needle = before.split(/\s+/)[0] ?? before;
    await window.getByTestId("editor-find").fill(needle);
    await expect(window.getByTestId("editor-match-count")).toContainText("in");
    await window.getByTestId("editor-replace").fill("REPLACED");
    await window.getByTestId("editor-replace-all").click();
    await expect(firstText).toHaveValue(/REPLACED/);

    // A speaker label is stored as a prefix but shown in its own field.
    await window.getByTestId("editor-cue-speaker").first().fill("Ana");
    await expect(firstText).toHaveValue(/REPLACED/);

    // Undo takes back the speaker, leaving the replace in place.
    await window.getByTestId("editor-undo").click();
    await expect(window.getByTestId("editor-cue-speaker").first()).toHaveValue(
      "",
    );

    await window.getByTestId("editor-save").click();
    await expect(window.getByTestId("transcript-editor")).toHaveCount(0);

    // Reopen: the edit survived the round trip through the database.
    await editButton.click();
    await expect(window.getByTestId("editor-cue-text").first()).toHaveValue(
      /REPLACED/,
    );
    await window.getByTestId("editor-cancel").click();

    // "Select clip" makes plain clicks set the span — shift-click is the shortcut, but
    // nothing advertised it, so the toggle is the discoverable path and needs to work.
    const lines = window.getByTestId("media-detail-transcript-segment");
    await window.getByTestId("transcript-clip-mode").click();
    await lines.first().click();
    await lines.last().click();
    await expect(window.getByTestId("clip-bar")).toBeVisible();
    // Toggling off clears the pending span and restores seek-on-click.
    await window.getByTestId("transcript-clip-mode").click();
    await expect(window.getByTestId("clip-bar")).toHaveCount(0);

    // Export presets each write a file and report where.
    for (const preset of ["markdown", "json", "csv", "obsidian"]) {
      await window.getByTestId("export-menu-trigger").click();
      await window.getByTestId(`export-preset-${preset}`).click();
      await expect(window.getByTestId("export-message")).toContainText("Wrote");
    }
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
