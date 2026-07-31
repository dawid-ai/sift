import type { MediaListItem } from "@sift/ipc-contract";

export interface LibraryFilterOpts {
  activeTag: string | null;
  channel: string | null; // exact uploader
  platform: string | null; // exact media.platformId
  from: number | null; // inclusive ms epoch (capture date)
  to: number | null; // inclusive ms epoch
  searchIds: Set<number> | null; // media ids from an active search; null = no search
}

/** Applies tag/channel/platform/date filters and an optional search-id intersection. Pure; order-preserving. */
export function filterLibrary(items: MediaListItem[], o: LibraryFilterOpts): MediaListItem[] {
  return items.filter((i) => {
    if (o.activeTag && !i.tags.some((t) => t.toLowerCase() === o.activeTag!.toLowerCase())) return false;
    if (o.channel && (i.media.uploader ?? "") !== o.channel) return false;
    if (o.platform && i.media.platformId !== o.platform) return false;
    if (o.from != null && i.media.createdAt < o.from) return false;
    if (o.to != null && i.media.createdAt > o.to) return false;
    if (o.searchIds && !o.searchIds.has(i.media.id)) return false;
    return true;
  });
}
