import { useEffect, useState } from "react";
import { TagChip } from "./tag-chip";

export function TagEditor({
  mediaId,
  tags,
  onChange,
}: {
  mediaId: number;
  tags: string[];
  onChange: () => void;
}) {
  const [value, setValue] = useState("");
  const [all, setAll] = useState<string[]>([]);

  useEffect(() => {
    window.sift.tags.listAll().then((rows) => setAll(rows.map((r) => r.name)));
  }, [tags]);

  async function commit(raw: string) {
    const names = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const n of names) await window.sift.tags.add(mediaId, n);
    setValue("");
    onChange();
  }

  async function remove(name: string) {
    await window.sift.tags.remove(mediaId, name);
    onChange();
  }

  const suggestions = value.trim()
    ? all.filter(
        (n) =>
          n.toLowerCase().includes(value.trim().toLowerCase()) &&
          !tags.some((t) => t.toLowerCase() === n.toLowerCase()),
      )
    : [];

  return (
    <div data-testid="tag-editor" className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <TagChip key={t} name={t} onRemove={() => remove(t)} />
        ))}
      </div>
      <div className="relative">
        <input
          data-testid="tag-input"
          className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs"
          placeholder="Add tags (comma-separated)…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              e.preventDefault();
              commit(value);
            }
          }}
          list="tag-suggestions"
        />
        <datalist id="tag-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
