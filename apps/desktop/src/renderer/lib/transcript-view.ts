/** Formats seconds as `m:ss`, or `h:mm:ss` once the hour mark is crossed. */
export function formatTimestamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

/** Appends a YouTube-style `t=<sec>s` timestamp param, respecting an existing query string. */
export function appendTimeParam(url: string, sec: number): string {
  const t = `t=${Math.floor(sec)}s`;
  return url.includes("?") ? `${url}&${t}` : `${url}?${t}`;
}

/** Index of the last segment whose start is <= t (segments are ascending by start),
 * or -1 when none qualify. Drives the synced transcript's active-line highlight. */
export function activeSegmentIndex(
  segments: { start: number }[],
  t: number,
): number {
  let idx = -1;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    if (segment.start <= t) idx = i;
    else break;
  }
  return idx;
}
