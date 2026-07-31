// Friendly display names for known platform ids (media.platformId is a lowercase
// extractor id like "youtube"/"twitter"). Unknown ids fall back to Title-case so any
// platform yt-dlp yields still shows sensibly — the Library filter stays adaptive.
const LABELS: Record<string, string> = {
  youtube: "YouTube",
  twitter: "X",
  x: "X",
  tiktok: "TikTok",
  vimeo: "Vimeo",
  soundcloud: "SoundCloud",
  instagram: "Instagram",
  facebook: "Facebook",
  twitch: "Twitch",
  reddit: "Reddit",
  dailymotion: "Dailymotion",
};

/** Human label for a platform id ("youtube" → "YouTube", "twitter" → "X"), else Title-case. */
export function platformLabel(id: string): string {
  const key = id.toLowerCase();
  return LABELS[key] ?? (id ? id[0]!.toUpperCase() + id.slice(1) : id);
}
