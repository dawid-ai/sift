import { beforeEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import {
  runMigrations,
  listPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
  insertMedia,
  insertSummary,
} from "./index";
import type { SiftDatabase, NewMedia } from "./index";

function media(db: SiftDatabase, url = "https://y/1"): number {
  const m: NewMedia = {
    source_url: url, platform_id: "youtube", external_id: "abc", title: "Vid",
    uploader: "Chan", uploader_url: null, duration_s: 100, thumbnail_path: null,
    view_count: null, like_count: null, published_at: null, metadata_json: null,
    download_status: "none",
  };
  return insertMedia(db, m).id;
}

describe("prompt queries", () => {
  let db: SiftDatabase;
  beforeEach(async () => { db = await openTestDatabase(); runMigrations(db); });

  it("returns the 3 seeded built-ins in seed order", () => {
    const prompts = listPrompts(db);
    expect(prompts).toHaveLength(3);
    expect(prompts.every((p) => p.is_builtin === 1)).toBe(true);
    expect(prompts.map((p) => p.name)).toEqual(["Key points", "Detailed summary", "TL;DR"]);
  });

  it("getPromptById returns the matching row", () => {
    const first = listPrompts(db)[0]!;
    expect(getPromptById(db, first.id)?.name).toBe("Key points");
  });

  it("createPrompt inserts a user prompt after the built-ins", () => {
    const row = createPrompt(db, { name: "My prompt", body: "Do the thing" });
    expect(row.is_builtin).toBe(0);
    expect(row.name).toBe("My prompt");
    expect(row.body).toBe("Do the thing");
    expect(row.created_at).toBeGreaterThan(0);

    const prompts = listPrompts(db);
    expect(prompts).toHaveLength(4);
    expect(prompts[3]).toEqual(row);
  });

  it("updatePrompt changes name/body of a user prompt and returns it", () => {
    const created = createPrompt(db, { name: "Old name", body: "Old body" });
    const updated = updatePrompt(db, created.id, { name: "New name", body: "New body" });
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("New name");
    expect(updated.body).toBe("New body");
    expect(getPromptById(db, created.id)?.name).toBe("New name");
  });

  it("updatePrompt on a built-in throws", () => {
    const builtin = listPrompts(db)[0]!;
    expect(() => updatePrompt(db, builtin.id, { name: "x", body: "y" })).toThrow();
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
      media_id: mid, prompt_id: created.id, provider_id: "anthropic", model: "claude-sonnet",
      text: "summary text",
    });
    expect(() => deletePrompt(db, created.id)).toThrow(/used by saved summaries/);
    expect(getPromptById(db, created.id)).toBeDefined();
  });
});
