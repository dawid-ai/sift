/** Single source of truth for app identity. Rename here to rebrand. */
export const branding = {
  appName: "Sift",
  appId: "com.sift.desktop",
  slug: "sift",
} as const;

export type Branding = typeof branding;
