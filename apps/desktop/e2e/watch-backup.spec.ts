import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

/**
 * Watch folders, model/language selection, and the backup section.
 *
 * The folder picker and the backup folder picker are native dialogs, so those stay in
 * `docs/TEST-MATRIX.md`. What this covers is that the sections render, the language settings
 * persist, and the missing-files scan runs against a real library.
 */
test("Settings: languages persist, watch folders start empty, verify reports a clean library", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();
    await window.getByRole("button", { name: "Settings" }).click();

    // Watch folders start empty and offer the picker.
    await expect(window.getByTestId("watch-folders-empty")).toBeVisible();
    await expect(window.getByTestId("watch-folder-add")).toBeEnabled();

    // Models and languages.
    await window.getByTestId("settings-tab-transcription").click();
    const section = window.getByTestId("languages-section");
    await expect(section).toBeVisible();

    await window.getByTestId("whisper-language").click();
    await window.getByRole("option", { name: "Polish" }).click();
    await window.getByTestId("ocr-language").fill("eng+deu");
    await window.getByTestId("languages-save").click();
    // Saved, so the button goes back to disabled.
    await expect(window.getByTestId("languages-save")).toBeDisabled();

    // A bad OCR code is refused rather than silently reset.
    await window.getByTestId("ocr-language").fill("../etc");
    await window.getByTestId("languages-save").click();
    await expect(section).toContainText("Not an OCR language code");

    // Switching model warns that saving is not the same as downloading.
    await window.getByTestId("ocr-language").fill("eng");
    await window.getByTestId("whisper-model").click();
    await window.getByRole("option", { name: /Tiny/ }).click();
    await expect(window.getByTestId("model-change-note")).toBeVisible();

    // Backup: the missing-files scan runs on an empty library and reports it clean.
    await window.getByTestId("settings-tab-system").click();
    await expect(window.getByTestId("backup-section")).toBeVisible();
    await window.getByTestId("backup-verify").click();
    await expect(window.getByTestId("backup-message")).toContainText(
      "where it should be",
    );
    await expect(window.getByTestId("missing-files")).toHaveCount(0);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
