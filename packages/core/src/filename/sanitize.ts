// Reserved chars (Windows + POSIX) plus ASCII control chars 0x00-0x1F.
// NOTE: whitespace collapsing runs BEFORE this regex is applied (see
// sanitizeFilename), so whitespace control chars (\t \n \r \v \f) are
// already turned into plain spaces by the time this runs and are never
// matched here as "reserved". See the deviation note in the report for why.
// eslint-disable-next-line no-control-regex -- intentional: stripping ASCII control chars from filenames
const RESERVED_RE = /[<>:"/\\|?*\x00-\x1F]/g;

export function sanitizeFilename(
  name: string,
  opts: { maxLength?: number } = {},
): string {
  const maxLength = opts.maxLength ?? 200;
  let out = name
    .replace(/\s+/g, " ")
    .replace(RESERVED_RE, "_")
    .trim()
    .replace(/[._ ]+$/, "")
    .replace(/^[._ ]+/, "");
  if (out.length > maxLength)
    out = out.slice(0, maxLength).replace(/[._ ]+$/, "");
  return out.length > 0 ? out : "untitled";
}

export function buildOutputBaseName(
  uploader: string | null,
  title: string,
): string {
  return sanitizeFilename(uploader ? `${uploader}__${title}` : title);
}
