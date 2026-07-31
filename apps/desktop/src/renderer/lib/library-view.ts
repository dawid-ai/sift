export type LibraryView = "table" | "tiles";
const KEY = "sift.libraryView";
export function getLibraryView(): LibraryView {
  return localStorage.getItem(KEY) === "tiles" ? "tiles" : "table"; // default table
}
export function setLibraryView(v: LibraryView): void {
  localStorage.setItem(KEY, v);
}
