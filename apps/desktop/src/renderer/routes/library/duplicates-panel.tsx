import { useEffect, useState } from "react";
import { Copy, X } from "lucide-react";
import type { DuplicateGroup, MediaListItem } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";

const REASON_LABEL: Record<DuplicateGroup["reason"], string> = {
  "same-source": "Same video",
  "same-title-duration": "Same title and length",
};

const REASON_HINT: Record<DuplicateGroup["reason"], string> = {
  "same-source":
    "Identical platform and video id — the same video fetched twice, usually through two URL forms.",
  "same-title-duration":
    "A guess: same title and the same exact length. Could be a re-upload, or one file imported twice.",
};

/**
 * Lists probable duplicates, newest group first, and lets the user remove the copies they
 * do not want.
 *
 * Nothing is removed automatically, and no row is pre-selected. "Probable" is the operative
 * word for the title-and-length reason — two conference talks can legitimately share both —
 * so the panel presents the evidence and leaves the choice with the user.
 */
export function DuplicatesPanel({
  onClose,
  onRemoved,
}: {
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [titles, setTitles] = useState<Map<number, MediaListItem>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setGroups(null);
    void Promise.all([
      window.sift.library.findDuplicates(),
      window.sift.library.list(),
    ])
      .then(([found, all]) => {
        setGroups(found);
        setTitles(new Map(all.map((i) => [i.media.id, i])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(load, []);

  async function remove(id: number) {
    setBusy(true);
    setError(null);
    try {
      await window.sift.library.remove(id);
      onRemoved();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-testid="duplicates-panel"
      className="rounded-xl border border-white/[0.07] bg-black/25 p-4"
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <Copy aria-hidden className="h-4 w-4 text-foreground/50" />
          Possible duplicates
        </h2>
        <button
          type="button"
          aria-label="Close duplicates"
          data-testid="duplicates-close"
          className="text-foreground/50 hover:text-foreground"
          onClick={onClose}
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </header>

      {error && (
        <p
          className="mt-3 text-[12px] text-danger"
          data-testid="duplicates-error"
        >
          {error}
        </p>
      )}

      {groups === null && !error && (
        <p className="mt-3 text-[12px] text-foreground/50">Scanning…</p>
      )}

      {groups?.length === 0 && (
        <p
          className="mt-3 text-[12px] text-foreground/60"
          data-testid="duplicates-empty"
        >
          Nothing looks duplicated.
        </p>
      )}

      <ul className="mt-3 flex flex-col gap-3">
        {groups?.map((g) => (
          <li
            key={`${g.reason}:${g.key}`}
            data-testid="duplicate-group"
            className="rounded-lg border border-white/[0.06] bg-black/20 p-3"
          >
            <div className="flex items-baseline gap-2">
              <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-foreground/70">
                {REASON_LABEL[g.reason]}
              </span>
              <span className="text-[11px] text-foreground/45">
                {g.ids.length} copies
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/50">
              {REASON_HINT[g.reason]}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {g.ids.map((mediaId) => {
                const item = titles.get(mediaId);
                return (
                  <li
                    key={mediaId}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-white/[0.03]"
                  >
                    <span className="min-w-0 truncate text-[12px] text-foreground/85">
                      {item?.media.title ?? `Media ${mediaId}`}
                      {item?.media.uploader && (
                        <span className="text-foreground/45">
                          {" "}
                          · {item.media.uploader}
                        </span>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      className="h-7 shrink-0 px-2 text-[11px] text-danger hover:text-danger"
                      data-testid={`duplicate-remove-${mediaId}`}
                      disabled={busy}
                      onClick={() => void remove(mediaId)}
                    >
                      Remove
                    </Button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
