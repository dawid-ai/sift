import { useEffect, useState } from "react";
import { Download, Plus, Upload } from "lucide-react";
import type { PromptInfo } from "@sift/ipc-contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CountTag,
  DESTRUCTIVE_ACTION,
  FIELD,
  FULL_BLEED_SM,
  GroupLabel,
  MicroLabel,
  NESTED_SURFACE,
  SECTION_RULE,
  SettingsError,
  SettingsHint,
  SettingsTextarea,
} from "./settings-page";

// Shown under every prompt-body textarea so a user editing a seeded prompt (several of
// which carry the marker) knows what it does before deleting it.
const TIMESTAMPS_HINT =
  "Include {{TIMESTAMPS}} to get a timestamped transcript ([mm:ss] per line) instead of flat text — needed for chapters, clip timings, or anything that must cite times.";

export function PromptsSection() {
  const [prompts, setPrompts] = useState<PromptInfo[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editBody, setEditBody] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.sift.prompts.list().then((list) => {
      if (!cancelled) setPrompts(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    const list = await window.sift.prompts.list();
    setPrompts(list);
  }

  async function handleAdd() {
    setAdding(true);
    setError(null);
    try {
      await window.sift.prompts.create({ name, body });
      setName("");
      setBody("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  function startEdit(p: PromptInfo) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditBody(p.body);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditBody("");
  }

  async function handleUpdate(id: number) {
    setBusyId(id);
    setError(null);
    try {
      await window.sift.prompts.update(id, { name: editName, body: editBody });
      cancelEdit();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: number) {
    setBusyId(id);
    setError(null);
    try {
      await window.sift.prompts.delete(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleImport() {
    setError(null);
    setNotice(null);
    try {
      const { imported, skipped, replaced } =
        await window.sift.prompts.import();
      if (imported > 0 || skipped > 0) {
        const total = imported + skipped;
        const countPart =
          skipped > 0
            ? `Imported ${imported} of ${total}; skipped ${skipped} malformed entr${skipped === 1 ? "y" : "ies"}.`
            : `Imported ${imported} prompt${imported === 1 ? "" : "s"}.`;
        const replacedPart =
          replaced > 0
            ? ` ${replaced} replaced existing prompt${replaced === 1 ? "" : "s"} of the same name.`
            : "";
        setNotice(`${countPart}${replacedPart}`);
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // A thrown error can still follow a partial write (e.g. a later pack entry collided
      // with a built-in name after earlier entries were already upserted) — refresh so the
      // list reflects what actually happened rather than going stale under the error.
      await refresh();
    }
  }

  async function handleExport() {
    setError(null);
    setNotice(null);
    try {
      const path = await window.sift.prompts.export();
      if (path) setNotice(`Exported to ${path}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div data-testid="prompts-section" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center">
          <GroupLabel>Prompts</GroupLabel>
          <CountTag>{prompts.length}</CountTag>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid="prompts-import"
            disabled={adding || busyId !== null}
            onClick={() => void handleImport()}
          >
            <Upload className="h-3.5 w-3.5" />
            Import pack
          </Button>
          <Button
            size="sm"
            variant="outline"
            data-testid="prompts-export"
            disabled={adding || busyId !== null}
            onClick={() => void handleExport()}
          >
            <Download className="h-3.5 w-3.5" />
            Export pack
          </Button>
        </div>
      </div>

      {error && (
        <SettingsError data-testid="prompt-error">{error}</SettingsError>
      )}
      {notice && (
        <p
          data-testid="prompts-notice"
          className="rounded-xl border border-success/25 bg-success/12 px-3 py-2 text-xs leading-relaxed text-success"
        >
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {prompts.map((p) => {
          const editing = editingId === p.id;
          return (
            <div
              key={p.id}
              data-testid={`prompt-item-${p.id}`}
              className={cn(NESTED_SURFACE, "px-4 py-3.5")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {p.name}
                  </p>
                  {!editing && (
                    <p className="mt-1.5 line-clamp-2 max-w-[62ch] text-[12px] leading-relaxed text-foreground/60">
                      {p.body}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {p.isBuiltin ? (
                    <Badge
                      data-testid={`prompt-builtin-${p.id}`}
                      variant="neutral"
                    >
                      Built-in
                    </Badge>
                  ) : (
                    !editing && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`prompt-edit-${p.id}`}
                          disabled={busyId !== null}
                          onClick={() => startEdit(p)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={DESTRUCTIVE_ACTION}
                          data-testid={`prompt-delete-${p.id}`}
                          disabled={busyId !== null}
                          onClick={() => void handleDelete(p.id)}
                        >
                          {busyId === p.id ? "Deleting…" : "Delete"}
                        </Button>
                      </>
                    )
                  )}
                </div>
              </div>

              {!p.isBuiltin && editing && (
                <div
                  className={cn(
                    "mt-3 flex flex-col gap-2 border-t pt-3",
                    SECTION_RULE,
                    FULL_BLEED_SM,
                  )}
                >
                  <MicroLabel>Editing</MicroLabel>
                  <Input
                    data-testid={`prompt-edit-name-${p.id}`}
                    className={FIELD}
                    value={editName}
                    disabled={busyId === p.id}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <SettingsTextarea
                    data-testid={`prompt-edit-body-${p.id}`}
                    className="min-h-[90px] font-mono text-[13px]"
                    placeholder="Enter the full replacement prompt body"
                    value={editBody}
                    disabled={busyId === p.id}
                    onChange={(e) => setEditBody(e.target.value)}
                  />
                  <SettingsHint>{TIMESTAMPS_HINT}</SettingsHint>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      data-testid={`prompt-edit-save-${p.id}`}
                      disabled={busyId === p.id || !editName || !editBody}
                      onClick={() => void handleUpdate(p.id)}
                    >
                      {busyId === p.id ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`prompt-edit-cancel-${p.id}`}
                      disabled={busyId === p.id}
                      onClick={cancelEdit}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Dashed = an empty slot waiting to be filled, the reference's language for "add one".
          Its label heads a BLOCK, so it is a GroupLabel — the same tier as "Prompts" 20px
          above it. MicroLabel is for a strip that opens inside a row ("Editing"), which is
          what the edit form above uses it for. */}
      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-white/[0.10] p-4">
        <GroupLabel>Add prompt</GroupLabel>
        <Input
          data-testid="prompt-name-input"
          className={FIELD}
          placeholder="Prompt name"
          value={name}
          disabled={adding}
          onChange={(e) => setName(e.target.value)}
        />
        <SettingsTextarea
          data-testid="prompt-body-input"
          className="min-h-[90px] font-mono text-[13px]"
          placeholder="Prompt body"
          value={body}
          disabled={adding}
          onChange={(e) => setBody(e.target.value)}
        />
        <SettingsHint>{TIMESTAMPS_HINT}</SettingsHint>
        <div>
          <Button
            data-testid="prompt-add"
            size="lg"
            disabled={adding || !name || !body}
            onClick={() => void handleAdd()}
          >
            <Plus className="h-4 w-4" />
            {adding ? "Adding…" : "Add prompt"}
          </Button>
        </div>
      </div>
    </div>
  );
}
