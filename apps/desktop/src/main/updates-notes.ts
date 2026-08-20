// electron-updater serves GitHub release notes as HTML (from the repo's releases.atom feed),
// not markdown/plain text. The renderer shows them as text, so we flatten HTML → readable
// plain text here (turning lists into bullet lines and decoding the common entities).

type ReleaseNoteInfo = { version: string; note: string | null };

/** Convert an HTML fragment to readable plain text. */
export function stripHtml(html: string): string {
  return (
    html
      // Raw newlines in HTML are wrapping, not structure. GitHub renders release
      // bodies in breaks mode, so hard-wrapped source lines arrive as <br> — treat
      // those as spaces too; real structure comes from <p>/<li>/heading tags.
      .replace(/\s+/g, " ")
      .replace(/<\s*br\s*\/?>/gi, " ")
      .replace(/<\s*hr\s*\/?>/gi, "\n")
      .replace(/<\s*li[^>]*>/gi, "• ")
      .replace(/<\/\s*(p|div|h[1-6]|ul|ol|li)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#(?:39|x27);/gi, "'")
      .replace(/ {2,}/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** electron-updater's releaseNotes is `string | {version, note}[] | null`. Flatten to plain text. */
export function notesToText(
  notes: string | ReleaseNoteInfo[] | null | undefined,
): string {
  if (!notes) return "";
  if (typeof notes === "string") return stripHtml(notes);
  return notes
    .map((n) => (n.note ? stripHtml(n.note) : ""))
    .filter(Boolean)
    .join("\n\n");
}
