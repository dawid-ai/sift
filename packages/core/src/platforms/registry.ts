import { TESTED_PLATFORMS } from "./tiers";

export type PlatformTier = "tested" | "supported" | "unknown";

export interface PlatformInfo {
  id: string;
  label: string;
  tier: PlatformTier;
}

/** Resolve a yt-dlp extractor key into platform info, tiered by test coverage. */
export function resolvePlatform(
  extractorKey: string | null | undefined,
): PlatformInfo {
  const trimmed = extractorKey?.trim();
  if (!trimmed) {
    return { id: "unknown", label: "Unknown", tier: "unknown" };
  }

  const id = trimmed.toLowerCase();
  const tested = TESTED_PLATFORMS[id];
  if (tested !== undefined) {
    return { id, label: tested, tier: "tested" };
  }

  return { id, label: extractorKey as string, tier: "supported" };
}

/** All curated tested-tier platforms, for display in Settings, etc. */
export function listTestedPlatforms(): PlatformInfo[] {
  return Object.entries(TESTED_PLATFORMS).map(([id, label]) => ({
    id,
    label,
    tier: "tested" as const,
  }));
}
