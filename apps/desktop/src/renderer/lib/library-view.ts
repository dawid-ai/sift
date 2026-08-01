export type LibraryView = "table" | "tiles";
const KEY = "sift.libraryView";
export function getLibraryView(): LibraryView {
  return localStorage.getItem(KEY) === "tiles" ? "tiles" : "table"; // default table
}
export function setLibraryView(v: LibraryView): void {
  localStorage.setItem(KEY, v);
}

export const PAGE_SIZE_OPTIONS = [24, 48, 96, 200] as const;
const PAGE_SIZE_KEY = "sift.libraryPageSize";
export function getPageSize(): number {
  const n = Number(localStorage.getItem(PAGE_SIZE_KEY));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : 24; // default 24
}
export function setPageSize(n: number): void {
  localStorage.setItem(PAGE_SIZE_KEY, String(n));
}
