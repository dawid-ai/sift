export type Platform =
  | "win-x64" | "win-arm64"
  | "mac-x64" | "mac-arm64"
  | "linux-x64" | "linux-arm64";

const MAP: Record<string, Platform> = {
  "win32|x64": "win-x64", "win32|arm64": "win-arm64",
  "darwin|x64": "mac-x64", "darwin|arm64": "mac-arm64",
  "linux|x64": "linux-x64", "linux|arm64": "linux-arm64",
};

export function currentPlatform(
  p: { platform: NodeJS.Platform; arch: string } = { platform: process.platform, arch: process.arch },
): Platform {
  const key = `${p.platform}|${p.arch}`;
  const found = MAP[key];
  if (!found) throw new Error(`Unsupported platform/arch: ${key}`);
  return found;
}
