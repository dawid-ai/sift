/**
 * Visual-QA capture. NOT an assertion spec — it drives the offline fixture through every
 * major surface and writes a PNG per surface to `e2e-shots/`, so a design pass can be
 * reviewed against real renders instead of guesses.
 *
 * Run: pnpm --filter @sift/desktop exec playwright test e2e/shots.spec.ts
 * Output: apps/desktop/e2e-shots/NN-surface.png
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import electronBinaryPath from "electron";
import { test, expect, _electron as electron, type Page } from "@playwright/test";

const OUT = join(__dirname, "..", "e2e-shots");

test("capture every surface", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-shots-"));
  await mkdir(OUT, { recursive: true });

  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  const window = await app.firstWindow();

  // Fixed viewport so shots are comparable run to run. Must come *after* firstWindow() —
  // BrowserWindow.getAllWindows() is empty until the window exists.
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900);
  });
  const shot = async (name: string) => {
    // Let layout/animation settle — framer-motion transitions are ~300ms.
    await window.waitForTimeout(450);
    await window.screenshot({ path: join(OUT, `${name}.png`) });
  };
  const go = async (name: string) => {
    await window.getByRole("button", { name }).click();
    await window.waitForTimeout(250);
  };
  const soft = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      // A surface that can't be reached shouldn't kill the rest of the capture.
      console.log(`[shots] skipped ${label}: ${(err as Error).message.split("\n")[0]}`);
    }
  };

  try {
    await window.waitForSelector("h1", { timeout: 30_000 });

    // Seed a realistic library BEFORE capturing. Against the bare fixture every list holds
    // one row, so the shots showed empty tables and "0" stat tiles — which reads as a design
    // failure when it is really a data artifact. Seeding is out-of-process; see seed-shots.cjs.
    await expect(window.getByTestId("db-ready")).toHaveText("db-ok", { timeout: 30_000 });
    const userDataPath = await app.evaluate(({ app: a }) => a.getPath("userData"));
    execFileSync(
      electronBinaryPath as unknown as string,
      [join(__dirname, "seed-shots.cjs"), join(userDataPath, "sift.db")],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
    );

    await shot("01-home-empty");

    await soft("home-preview", async () => {
      await window.getByTestId("url-input").fill("https://www.youtube.com/watch?v=fixture");
      await window.getByTestId("preview-card").waitFor({ timeout: 15_000 });
      await shot("02-home-preview");

      // Tags have to go in *before* the download click: the input holds local state that the
      // download call consumes. Typed afterwards they are silently dropped, which is what left
      // the library row and the detail page's tag card empty.
      const tags = window.getByTestId("download-tag-input");
      await tags.fill("systems");
      await tags.press("Enter");
      await tags.fill("deep-dive");
      await tags.press("Enter");

      await window.getByTestId("download-button").click();
      await window.getByTestId("download-done").waitFor({ timeout: 30_000 });
      await shot("03-home-downloaded");
    });

    await soft("home-transcript", async () => {
      await window.getByTestId("transcript-button").click();
      await window.getByTestId("transcript-panel").waitFor({ timeout: 30_000 });
      // The panel opens below the fold at 900px tall, so an unscrolled shot was byte-for-byte
      // the previous capture with nothing of the transcript in frame.
      await scrollShot(window, 1, "04-home-transcript");
    });

    // The fixture record ships without a summary, and it is the row the media-detail captures
    // land on (it sorts newest in the library). Running one here means those shots review a
    // populated detail page instead of a summary tab reading "No prompt run yet." A seeded row
    // can't stand in: none has a real media file, so its player would render empty.
    await soft("home-summary", async () => {
      await window.getByTestId("summarize-button").click();
      await window.getByTestId("summary-content").waitFor({ timeout: 30_000 });
      await scrollShot(window, 1, "04b-home-summary");
    });

    await soft("library-table", async () => {
      await go("Library");
      await window.getByTestId("library-table").waitFor({ timeout: 15_000 });
      await shot("05-library-table");
    });

    await soft("library-tiles", async () => {
      await window.getByTestId("library-view-tiles").click();
      await window.getByTestId("library-grid").waitFor({ timeout: 10_000 });
      await shot("06-library-tiles");
      await window.getByTestId("library-view-table").click();
      await window.getByTestId("library-table").waitFor({ timeout: 10_000 });
    });

    await soft("media-detail", async () => {
      await window.getByTestId("media-open").first().click();
      await window.getByTestId("media-detail").waitFor({ timeout: 15_000 });
      await shot("07-media-detail");

      await window.getByTestId("media-detail-tab-summary").click();
      await shot("08-media-detail-summary");

      await window.getByTestId("media-detail-tab-files").click();
      await shot("09-media-detail-files");

      await window.getByTestId("media-detail-back").click();
      await window.waitForTimeout(300);
    });

    await soft("queue", async () => {
      await go("Queue");
      await shot("10-queue");
    });

    await soft("channels", async () => {
      await go("Channels");
      await shot("11-channels");
    });

    await soft("settings", async () => {
      await go("Settings");
      await shot("12-settings-top");
      await scrollShot(window, 0.45, "13-settings-mid");
      await scrollShot(window, 1, "14-settings-lower");
    });

    // Settings is four tabs, and all three shots above are the General one at different scroll
    // offsets — transcription, AI and system went unreviewed entirely. Each tab gets its top
    // and its foot; the logged scrollTop says whether the foot shot is a distinct frame.
    await soft("settings-sections", async () => {
      const tabs = [
        ["transcription", "15-settings-transcription"],
        ["ai", "16-settings-ai"],
        ["system", "17-settings-system"],
      ] as const;
      for (const [id, name] of tabs) {
        await window.getByTestId(`settings-tab-${id}`).click();
        // Switching tabs keeps the pane's scroll offset, so the "top" shot landed mid-page.
        await scrollShot(window, 0, name);
        await scrollShot(window, 1, `${name}-lower`);
      }
    });
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});

/**
 * Scroll the page's real scroll container to `fraction` of its travel and shoot.
 *
 * Fixed pixel offsets silently produced byte-identical captures once the content was
 * shorter than the offset — two "different" settings shots were the same image, so a third
 * of the page went unreviewed. Scrolling by fraction of actual travel and returning the
 * achieved offset makes that failure visible instead.
 */
async function scrollShot(window: Page, fraction: number, name: string): Promise<number> {
  const achieved = await window.evaluate((f) => {
    const candidates = [...document.querySelectorAll<HTMLElement>("*")].filter(
      (e) => e.scrollHeight > e.clientHeight + 40 && e.clientHeight > 300,
    );
    // The innermost/tallest scroller is the content pane, not an outer wrapper.
    const pane = candidates.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    const el = pane ?? (document.scrollingElement as HTMLElement);
    if (!el) return -1;
    el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * f);
    return el.scrollTop;
  }, fraction);
  await window.waitForTimeout(400);
  await window.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`[shots] ${name}: scrollTop=${achieved}`);
  return achieved;
}
