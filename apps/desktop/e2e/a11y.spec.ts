import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  test,
  expect,
  _electron as electron,
  type Page,
} from "@playwright/test";
import { source as axeSource } from "axe-core";

// Accessibility regression cover for the five top-level views. The rest of the suite
// asserts that flows work; nothing until now asserted that they can be reached with a
// keyboard, that controls carry accessible names, or that text meets contrast.
//
// axe-core is injected into the page directly rather than through @axe-core/playwright:
// that wrapper opens a second page to handle iframes, which Electron refuses
// ("Target.createTarget: Not supported"). There are no iframes here.
//
// Only `serious` and `critical` violations fail the run. `moderate`/`minor` findings are
// printed, so a regression stays visible without the suite going red on debatable rules.

const VIEWS = ["Home", "Library", "Queue", "Channels", "Settings"] as const;
const SEVERE = new Set(["serious", "critical"]);

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string[] }[];
}

async function runAxe(page: Page): Promise<AxeViolation[]> {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const results = await (
      window as unknown as {
        axe: {
          run: (
            ctx: unknown,
            opts: unknown,
          ) => Promise<{ violations: AxeViolation[] }>;
        };
      }
    ).axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
    return results.violations;
  });
}

test("every view is free of serious accessibility violations", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId("db-ready")).toHaveText("db-ok");

    const failures: string[] = [];
    for (const view of VIEWS) {
      await window.getByRole("button", { name: view }).click();
      // Route chunks are lazy — wait for the placeholder to be replaced before scanning.
      await expect(window.getByTestId("route-loading")).toHaveCount(0);

      for (const v of await runAxe(window)) {
        const where = v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(", ");
        const line = `${view}: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node(s): ${where})`;
        if (SEVERE.has(v.impact ?? "")) failures.push(line);
        else console.log(`a11y (not failing): ${line}`);
      }
    }

    expect(failures, failures.join("\n")).toEqual([]);
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});

test("the sidebar is reachable and operable from the keyboard", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "sift-e2e-fixture-"));
  const app = await electron.launch({
    args: [join(__dirname, "..", "out", "main", "index.js")],
    env: { ...process.env, SIFT_E2E_FIXTURE_DIR: fixtureDir },
  });

  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId("db-ready")).toHaveText("db-ok");

    // Tab until the Library nav button holds focus, then activate it with the keyboard.
    // A cap keeps a broken focus order from turning into a 60s timeout.
    const library = window.getByRole("button", { name: "Library" });
    let focused = false;
    for (let i = 0; i < 40 && !focused; i++) {
      await window.keyboard.press("Tab");
      focused = await library.evaluate((el) => el === document.activeElement);
    }
    expect(focused, "Library nav never received focus while tabbing").toBe(
      true,
    );

    await window.keyboard.press("Enter");
    await expect(window.getByTestId("route-loading")).toHaveCount(0);
    await expect(window.getByTestId("library-empty")).toBeVisible();
  } finally {
    await app.close();
    await rm(fixtureDir, { recursive: true, force: true });
  }
});
