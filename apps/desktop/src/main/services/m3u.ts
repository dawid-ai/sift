export interface M3UEntry {
  title: string;
  uploader: string | null;
  durationSec: number | null;
  filePath: string;
}

/** Builds an #EXTM3U playlist string. Duration -1 when unknown; label is "uploader — title" (title alone if no uploader). */
export function buildM3U(entries: M3UEntry[]): string {
  const lines = ["#EXTM3U"];
  for (const e of entries) {
    const dur = e.durationSec != null ? Math.round(e.durationSec) : -1;
    const raw = e.uploader ? `${e.uploader} — ${e.title}` : e.title;
    // M3U is line-based: a newline/CR in the metadata would split the #EXTINF line
    // and corrupt the entry. Collapse any control chars to a space.
    const label = raw.replace(/[\r\n]+/g, " ");
    lines.push(`#EXTINF:${dur},${label}`);
    lines.push(e.filePath);
  }
  return lines.join("\n") + "\n";
}
