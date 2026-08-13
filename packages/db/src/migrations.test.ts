import { describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import { runMigrations } from "./migrations";
import { listPrompts } from "./prompt";

describe("runMigrations", () => {
  it("creates the asset table and is idempotent", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    runMigrations(db); // second run must not throw
    const cols = db
      .prepare<{ name: string }>("PRAGMA table_info(asset)")
      .all()
      .map((c) => c.name);
    expect(cols).toContain("kind");
    expect(cols).toContain("sha256");
    const applied = db
      .prepare<{ version: number }>("SELECT version FROM schema_migrations")
      .all();
    expect(applied).toHaveLength(17);
    db.close();
  });

  it("rolls back a migration whose DDL half-applies (atomic)", async () => {
    const db = await openTestDatabase();
    // A migration that creates a table THEN fails on a bad statement. The fix must
    // roll the CREATE back, so a retry sees neither the table nor a recorded version.
    const poison = [
      { version: 1, sql: "CREATE TABLE poison (x INTEGER); INSERT INTO nonexistent VALUES (1)" },
    ];
    expect(() => runMigrations(db, poison)).toThrow();
    const tables = db
      .prepare<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='poison'")
      .all();
    expect(tables).toHaveLength(0); // rolled back
    const applied = db
      .prepare<{ version: number }>("SELECT version FROM schema_migrations")
      .all();
    expect(applied).toHaveLength(0); // version not recorded
    db.close();
  });

  it("seeds the creator prompt pack as editable (non-builtin) rows", async () => {
    const db = await openTestDatabase();
    runMigrations(db);
    const prompts = listPrompts(db);
    const names = prompts.map((p) => p.name);

    expect(names).toContain("YouTube chapters");
    expect(names).toContain("Title ideas");
    expect(names).toContain("Blog post");

    const chapters = prompts.find((p) => p.name === "YouTube chapters")!;
    expect(chapters.is_builtin).toBe(0);
    // Chapters are worthless without real times — the prompt must opt into timestamps.
    expect(chapters.body).toContain("{{TIMESTAMPS}}");

    const showNotes = prompts.find((p) => p.name === "Podcast show notes")!;
    expect(showNotes.body).toContain("{{TIMESTAMPS}}");
    db.close();
  });
});
