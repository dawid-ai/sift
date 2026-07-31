import { tagColor } from "@/lib/tag-color";

export function TagChip({ name, onRemove }: { name: string; onRemove?: () => void }) {
  const c = tagColor(name);
  return (
    <span
      data-testid="tag-chip"
      data-tag={name}
      className="inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove tag ${name}`}
          className="opacity-60 hover:opacity-100"
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </span>
  );
}
