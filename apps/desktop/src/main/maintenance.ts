import { resetDownloadingToError, type SiftDatabase } from "@sift/db";

/**
 * On startup, any download row still 'downloading' is a leftover from a
 * crashed run (no download is actually in flight). Mark them 'error' so the
 * UI/queue can act on them. Returns the number of rows changed.
 */
export function resetStaleDownloads(db: SiftDatabase): number {
  return resetDownloadingToError(db);
}
