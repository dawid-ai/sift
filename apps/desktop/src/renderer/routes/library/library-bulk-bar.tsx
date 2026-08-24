import { useState } from "react";
import { FolderPlus, Tag, Trash2, X } from "lucide-react";
import type { CollectionCount } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/ui/filter-select";

/**
 * Actions for a multi-row selection: tag, add to a collection, export a playlist, delete.
 *
 * Renders only when something is selected, so it costs nothing on the normal path. Delete
 * asks for a second click rather than opening a dialog — the count is right there on the
 * button, and a native modal for an action the user can immediately see the result of is
 * more friction than it buys.
 */
export function LibraryBulkBar({
  selected,
  collections,
  onClear,
  onDone,
}: {
  selected: number[];
  collections: CollectionCount[];
  onClear: () => void;
  /** Called after any mutation, so the page refetches. */
  onDone: (message: string) => void;
}) {
  const [tag, setTag] = useState("");
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [newCollection, setNewCollection] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (selected.length === 0) return null;

  async function run(work: () => Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      onDone(await work());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const addTag = () =>
    run(async () => {
      const changed = await window.sift.tags.bulkAdd(selected, tag.trim());
      setTag("");
      return `Tagged ${changed} of ${selected.length}.`;
    });

  const addToCollection = () =>
    run(async () => {
      // A typed name wins over the dropdown: the user just told us what they want, and
      // creating is idempotent by name, so this also covers "add to an existing one".
      const target = newCollection.trim()
        ? await window.sift.collections.create(newCollection.trim())
        : collections.find((c) => String(c.id) === collectionId);
      if (!target) throw new Error("Pick a collection or type a new name.");
      const added = await window.sift.collections.add(target.id, selected);
      setNewCollection("");
      return added === selected.length
        ? `Added ${added} to ${target.name}.`
        : `Added ${added} to ${target.name}; ${selected.length - added} were already in it.`;
    });

  const exportPlaylist = () =>
    run(async () => {
      const result = await window.sift.library.exportPlaylist(
        selected,
        `selection-${selected.length}`,
      );
      if (result.included === 0)
        return "Nothing to export — none of the selected videos has a file on disk.";
      return result.skipped > 0
        ? `Wrote ${result.included} entries to ${result.path}; skipped ${result.skipped} with no file.`
        : `Wrote ${result.included} entries to ${result.path}.`;
    });

  const remove = () =>
    run(async () => {
      const removed = await window.sift.library.bulkRemove(selected);
      onClear();
      return `Removed ${removed} of ${selected.length}.`;
    });

  return (
    <div
      data-testid="bulk-bar"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.07] px-3 py-2"
    >
      <span
        data-testid="bulk-count"
        className="text-[12px] font-medium text-foreground"
      >
        {selected.length} selected
      </span>
      <button
        type="button"
        data-testid="bulk-clear"
        aria-label="Clear selection"
        className="text-foreground/50 hover:text-foreground"
        onClick={onClear}
      >
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>

      <span className="mx-1 h-5 w-px bg-white/10" aria-hidden />

      <div className="flex items-center gap-1.5">
        <Input
          data-testid="bulk-tag-input"
          aria-label="Tag to add to the selection"
          className="h-9 w-[10rem] text-[12px]"
          placeholder="Add a tag…"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && tag.trim()) void addTag();
          }}
        />
        <Button
          variant="ghost"
          className="h-9 px-2.5 text-[12px]"
          data-testid="bulk-tag-apply"
          disabled={!tag.trim() || busy}
          onClick={() => void addTag()}
        >
          <Tag aria-hidden className="mr-1.5 h-3.5 w-3.5" />
          Tag
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <FilterSelect
          value={collectionId}
          onChange={setCollectionId}
          options={collections.map((c) => ({
            value: String(c.id),
            label: c.name,
          }))}
          allLabel="Pick a collection"
          testId="bulk-collection-select"
        />
        <Input
          data-testid="bulk-collection-new"
          aria-label="New collection name"
          className="h-9 w-[10rem] text-[12px]"
          placeholder="or a new one…"
          value={newCollection}
          onChange={(e) => setNewCollection(e.target.value)}
        />
        <Button
          variant="ghost"
          className="h-9 px-2.5 text-[12px]"
          data-testid="bulk-collection-add"
          disabled={busy || (!collectionId && !newCollection.trim())}
          onClick={() => void addToCollection()}
        >
          <FolderPlus aria-hidden className="mr-1.5 h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      <Button
        variant="ghost"
        className="h-9 px-2.5 text-[12px]"
        data-testid="bulk-export"
        disabled={busy}
        onClick={() => void exportPlaylist()}
      >
        Export playlist
      </Button>

      <Button
        variant="ghost"
        className="ml-auto h-9 px-2.5 text-[12px] text-danger hover:text-danger"
        data-testid="bulk-remove"
        disabled={busy}
        onClick={() => (confirmDelete ? void remove() : setConfirmDelete(true))}
      >
        <Trash2 aria-hidden className="mr-1.5 h-3.5 w-3.5" />
        {confirmDelete ? `Really remove ${selected.length}?` : "Remove"}
      </Button>

      {error && (
        <p
          data-testid="bulk-error"
          className="w-full text-[12px] leading-relaxed text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
