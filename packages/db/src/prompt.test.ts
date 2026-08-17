import { beforeEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import {
  runMigrations,
  listPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
  upsertPromptByName,
  insertMedia,
  insertSummary,
} from "./index";
import type { SiftDatabase, NewMedia } from "./index";

function media(db: SiftDatabase, url = "https://y/1"): number {
  const m: NewMedia = {
    source_url: url,
    platform_id: "youtube",
    external_id: "abc",
    title: "Vid",
    uploader: "Chan",
    uploader_url: null,
    duration_s: 100,
    thumbnail_path: null,
    view_count: null,
    like_count: null,
    published_at: null,
    metadata_json: null,
    download_status: "none",
  };
  return insertMedia(db, m).id;
}

describe("prompt queries", () => {
  let db: SiftDatabase;
  beforeEach(async () => {
    db = await openTestDatabase();
    runMigrations(db);
  });

  it("returns the 3 seeded built-ins in seed order", () => {
    // listPrompts also returns the (non-builtin) creator prompt pack seeded by migration
    // 017, so this asserts the built-ins are present and ordered first rather than a bare
    // total count of every row.
    const prompts = listPrompts(db);
    const builtins = prompts.filter((p) => p.is_builtin === 1);
    expect(builtins.map((p) => p.name)).toEqual([
      "Key points",
      "Detailed summary",
      "TL;DR",
    ]);
    expect(prompts.slice(0, 3)).toEqual(builtins);
  });

  it("getPromptById returns the matching row", () => {
    const first = listPrompts(db)[0]!;
    expect(getPromptById(db, first.id)?.name).toBe("Key points");
  });

  it("createPrompt inserts a user prompt after the built-ins", () => {
    // Baseline includes the 3 built-ins plus the (non-builtin) creator prompt pack seeded
    // by migration 017, so this asserts growth and ordering rather than a fixed total.
    const before = listPrompts(db);
    const row = createPrompt(db, { name: "My prompt", body: "Do the thing" });
    expect(row.is_builtin).toBe(0);
    expect(row.name).toBe("My prompt");
    expect(row.body).toBe("Do the thing");
    expect(row.created_at).toBeGreaterThan(0);

    const prompts = listPrompts(db);
    expect(prompts).toHaveLength(before.length + 1);
    expect(prompts.at(-1)).toEqual(row);
  });

  it("updatePrompt changes name/body of a user prompt and returns it", () => {
    const created = createPrompt(db, { name: "Old name", body: "Old body" });
    const updated = updatePrompt(db, created.id, {
      name: "New name",
      body: "New body",
    });
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("New name");
    expect(updated.body).toBe("New body");
    expect(getPromptById(db, created.id)?.name).toBe("New name");
  });

  it("updatePrompt on a built-in throws", () => {
    const builtin = listPrompts(db)[0]!;
    expect(() =>
      updatePrompt(db, builtin.id, { name: "x", body: "y" }),
    ).toThrow();
  });

  it("updatePrompt on a missing id throws", () => {
    expect(() => updatePrompt(db, 999999, { name: "x", body: "y" })).toThrow();
  });

  it("deletePrompt on a built-in throws", () => {
    const builtin = listPrompts(db)[0]!;
    expect(() => deletePrompt(db, builtin.id)).toThrow();
    expect(getPromptById(db, builtin.id)).toBeDefined();
  });

  it("deletePrompt on an unused user prompt removes it", () => {
    const created = createPrompt(db, { name: "Throwaway", body: "body" });
    deletePrompt(db, created.id);
    expect(getPromptById(db, created.id)).toBeUndefined();
  });

  it("deletePrompt is a no-op when the id is missing entirely", () => {
    expect(() => deletePrompt(db, 999999)).not.toThrow();
  });

  it("deletePrompt on a user prompt referenced by a summary throws 'used by'", () => {
    const created = createPrompt(db, { name: "In use", body: "body" });
    const mid = media(db);
    insertSummary(db, {
      media_id: mid,
      prompt_id: created.id,
      provider_id: "anthropic",
      model: "claude-sonnet",
      text: "summary text",
    });
    expect(() => deletePrompt(db, created.id)).toThrow(
      /used by saved summaries/,
    );
    expect(getPromptById(db, created.id)).toBeDefined();
  });
});

describe("upsertPromptByName", () => {
  it("creates a prompt when the name is new, reporting created: true", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const { row, created } = upsertPromptByName(db, {
      name: "Fresh pack entry",
      body: "Do the thing.",
    });
    expect(created).toBe(true);
    expect(row.name).toBe("Fresh pack entry");
    expect(row.is_builtin).toBe(0);
    expect(getPromptById(db, row.id)?.body).toBe("Do the thing.");
  });

  it("updates the body in place when the name already exists, reporting created: false", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const first = upsertPromptByName(db, { name: "Pack entry", body: "v1" });
    expect(first.created).toBe(true);
    const second = upsertPromptByName(db, { name: "Pack entry", body: "v2" });
    expect(second.created).toBe(false);
    expect(second.row.id).toBe(first.row.id);
    expect(second.row.body).toBe("v2");
    expect(listPrompts(db).filter((p) => p.name === "Pack entry")).toHaveLength(
      1,
    );
  });

  it("updates a prompt that saved summaries reference (delete would throw here)", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const { row: p } = upsertPromptByName(db, { name: "Used", body: "v1" });
    const mediaId = media(db);
    insertSummary(db, {
      media_id: mediaId,
      prompt_id: p.id,
      provider_id: "anthropic",
      model: "m",
      text: "a summary",
    });
    const updated = upsertPromptByName(db, { name: "Used", body: "v2" });
    expect(updated.created).toBe(false);
    expect(updated.row.body).toBe("v2");
  });

  it("refuses to overwrite a built-in prompt", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    expect(() =>
      upsertPromptByName(db, { name: "TL;DR", body: "hijacked" }),
    ).toThrow(/built-in/i);
  });

  // Mirrors what `prompts:import` does with the result of each call: fold `created` across a
  // whole pack into `{ created, replaced }` totals for the renderer's import notice (see
  // apps/desktop/src/main/ipc/summarize.ts). Covers the exact scenario the review that added
  // this flagged — a pack re-importing over prompts the user already edited must report how
  // many were replaced, not just a bare "imported N" count.
  it("lets a caller tally created vs. replaced across a whole pack import", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    // Pre-seed one prompt as if it survived from an earlier import/edit.
    upsertPromptByName(db, {
      name: "YouTube chapters",
      body: "user-edited body",
    });

    const pack = [
      { name: "YouTube chapters", body: "official pack body" }, // collides -> replaced
      { name: "Custom pack entry A", body: "new body" }, // new -> created
      { name: "Custom pack entry B", body: "new body" }, // new -> created
    ];
    let created = 0;
    let replaced = 0;
    for (const entry of pack) {
      const result = upsertPromptByName(db, entry);
      if (result.created) created++;
      else replaced++;
    }
    expect(created).toBe(2);
    expect(replaced).toBe(1);
    expect(
      getPromptById(
        db,
        listPrompts(db).find((p) => p.name === "YouTube chapters")!.id,
      )?.body,
    ).toBe("official pack body");
  });
});
