import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);

/**
 * `electron-builder.yml` pins `electronVersion` by hand, because electron-builder can't
 * resolve a semver range through pnpm's hoisted `node_modules` in this monorepo. That pin
 * silently went stale once: the app ran on the upgraded Electron in dev while the shipped
 * installer kept bundling the old (vulnerable) one. This check fails the gate instead.
 */
describe("electron-builder.yml", () => {
  it("pins the Electron version that is actually installed", () => {
    const yml = readFileSync(
      join(__dirname, "..", "electron-builder.yml"),
      "utf8",
    );
    const pinned = /^electronVersion:\s*(\S+)\s*$/m.exec(yml)?.[1];
    const installed = (require("electron/package.json") as { version: string })
      .version;
    expect(pinned).toBe(installed);
  });
});
