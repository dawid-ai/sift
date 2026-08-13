import type { SiftDatabase } from "./database";

export interface PromptRow {
  id: number;
  name: string;
  body: string;
  is_builtin: number;
  created_at: number;
}

export function listPrompts(db: SiftDatabase): PromptRow[] {
  return db
    .prepare<PromptRow>("SELECT * FROM prompt ORDER BY is_builtin DESC, id ASC")
    .all();
}

export function getPromptById(db: SiftDatabase, id: number): PromptRow | undefined {
  return db.prepare<PromptRow>("SELECT * FROM prompt WHERE id = @id").get({ id });
}

export function createPrompt(
  db: SiftDatabase,
  input: { name: string; body: string },
): PromptRow {
  const created_at = Date.now();
  const res = db
    .prepare(
      `INSERT INTO prompt (name, body, is_builtin, created_at)
       VALUES (@name, @body, 0, @created_at)`,
    )
    .run({ ...input, created_at });
  return getPromptById(db, Number(res.lastInsertRowid))!;
}

export function updatePrompt(
  db: SiftDatabase,
  id: number,
  input: { name: string; body: string },
): PromptRow {
  const existing = getPromptById(db, id);
  if (!existing) throw new Error(`Prompt ${id} not found`);
  if (existing.is_builtin === 1) throw new Error("Built-in prompts cannot be edited");
  db.prepare("UPDATE prompt SET name = @name, body = @body WHERE id = @id").run({
    ...input,
    id,
  });
  return getPromptById(db, id)!;
}

/**
 * Creates the prompt, or replaces the body of the existing prompt with the same name.
 * Used by prompt-pack import: matching on NAME (not id) is what makes a pack re-importable
 * after an update, and updating in place avoids `deletePrompt`'s "used by saved summaries"
 * guard — a re-import must not fail on the prompts the user actually ran.
 * Built-ins are refused rather than silently skipped, so a pack can't shadow them.
 */
export function upsertPromptByName(
  db: SiftDatabase,
  input: { name: string; body: string },
): PromptRow {
  const existing = db
    .prepare<PromptRow>("SELECT * FROM prompt WHERE name = @name ORDER BY id ASC LIMIT 1")
    .get({ name: input.name });
  if (!existing) return createPrompt(db, input);
  if (existing.is_builtin === 1) throw new Error(`"${input.name}" is a built-in prompt`);
  db.prepare("UPDATE prompt SET body = @body WHERE id = @id").run({
    body: input.body,
    id: existing.id,
  });
  return getPromptById(db, existing.id)!;
}

export function deletePrompt(db: SiftDatabase, id: number): void {
  const existing = getPromptById(db, id);
  if (!existing) return;
  if (existing.is_builtin === 1) throw new Error("Built-in prompts cannot be deleted");
  const inUse = db
    .prepare("SELECT 1 FROM summary WHERE prompt_id = @id LIMIT 1")
    .get({ id });
  if (inUse) throw new Error("This prompt is used by saved summaries");
  db.prepare("DELETE FROM prompt WHERE id = @id").run({ id });
}
