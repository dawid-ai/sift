import { useEffect, useState } from "react";
import type { PromptInfo } from "@sift/ipc-contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const TEXTAREA_CLASS =
  "flex min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50";

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
      const count = await window.sift.prompts.import();
      if (count > 0) {
        setNotice(`Imported ${count} prompt${count === 1 ? "" : "s"}.`);
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
    <div data-testid="prompts-section" className="flex flex-col gap-4">
      {error && (
        <p data-testid="prompt-error" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          data-testid="prompts-import"
          disabled={adding || busyId !== null}
          onClick={() => void handleImport()}
        >
          Import pack
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="prompts-export"
          disabled={adding || busyId !== null}
          onClick={() => void handleExport()}
        >
          Export pack
        </Button>
        {notice && (
          <span data-testid="prompts-notice" className="self-center text-sm text-foreground/60">
            {notice}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {prompts.map((p) => (
          <Card key={p.id} data-testid={`prompt-item-${p.id}`}>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">{p.name}</CardTitle>
              {p.isBuiltin && (
                <Badge data-testid={`prompt-builtin-${p.id}`} variant="outline">
                  Built-in
                </Badge>
              )}
            </CardHeader>
            {!p.isBuiltin && (
              <CardContent className="flex flex-col gap-3">
                {editingId === p.id ? (
                  <>
                    <Input
                      data-testid={`prompt-edit-name-${p.id}`}
                      value={editName}
                      disabled={busyId === p.id}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <textarea
                      data-testid={`prompt-edit-body-${p.id}`}
                      className={TEXTAREA_CLASS}
                      placeholder="Enter the full replacement prompt body"
                      value={editBody}
                      disabled={busyId === p.id}
                      onChange={(e) => setEditBody(e.target.value)}
                    />
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
                  </>
                ) : (
                  <div className="flex gap-2">
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
                      variant="outline"
                      data-testid={`prompt-delete-${p.id}`}
                      disabled={busyId !== null}
                      onClick={() => void handleDelete(p.id)}
                    >
                      {busyId === p.id ? "Deleting…" : "Delete"}
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add prompt</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            data-testid="prompt-name-input"
            placeholder="Prompt name"
            value={name}
            disabled={adding}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            data-testid="prompt-body-input"
            className={TEXTAREA_CLASS}
            placeholder="Prompt body"
            value={body}
            disabled={adding}
            onChange={(e) => setBody(e.target.value)}
          />
          <Button
            data-testid="prompt-add"
            disabled={adding || !name || !body}
            onClick={() => void handleAdd()}
          >
            {adding ? "Adding…" : "Add prompt"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
