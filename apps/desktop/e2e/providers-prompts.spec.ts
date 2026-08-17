import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, _electron as electron } from "@playwright/test";

test("Home provider picker lists multiple providers offline (static catalog)", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    await window
      .getByTestId("url-input")
      .fill("https://www.youtube.com/watch?v=fixture");

    const previewCard = window.getByTestId("preview-card");
    await expect(previewCard).toBeVisible();

    // The picker is driven by the renderer's static KNOWN_PROVIDERS catalog (see
    // ai-provider-catalog.ts), so all 4 built-in providers (Anthropic/OpenAI/Ollama/
    // Custom) list regardless of which ones have keys or are registered in the
    // main-process AiRegistry. We do NOT run a real summary through OpenAI/Ollama
    // here — there's no network in e2e — just assert the picker lists them.
    const providerSelect = window.getByTestId("summary-provider");
    await expect(providerSelect).toBeVisible();

    const optionValues = await providerSelect
      .locator("option")
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));

    // Ollama is keyless (needsKey: false), so it's always "ready" and becomes the
    // e2e default-selected provider (see App.tsx's defaultProviderId resolution) —
    // assert it plus at least one other provider are both present in the list.
    expect(optionValues).toContain("ollama");
    expect(optionValues.length).toBeGreaterThanOrEqual(2);
    expect(new Set(optionValues).size).toBe(optionValues.length);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});

test("Settings → Prompts: add-and-delete round-trips a user prompt", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();

    await window.getByRole("button", { name: "Settings" }).click();
    await window.getByTestId("settings-tab-ai").click();

    const promptsSection = window.getByTestId("prompts-section");
    await expect(promptsSection).toBeVisible();

    const promptName = `E2E Prompt ${Date.now()}`;
    await promptsSection.getByTestId("prompt-name-input").fill(promptName);
    await promptsSection
      .getByTestId("prompt-body-input")
      .fill("Summarize this in one sentence.");
    await promptsSection.getByTestId("prompt-add").click();

    const promptCard = promptsSection
      .locator('[data-testid^="prompt-item-"]')
      .filter({ hasText: promptName });
    await expect(promptCard).toBeVisible();

    // Built-in prompts render read-only (no Edit/Delete controls) — this is the
    // just-created user prompt, so its Delete button is present.
    await promptCard.getByRole("button", { name: "Delete" }).click();
    await expect(promptCard).toHaveCount(0);

    await expect(window.getByTestId("prompt-error")).toHaveCount(0);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
