/**
 * Constants for locally-imported media, shared by the main process (which stamps them
 * onto rows) and the renderer (which styles, sorts and labels by them). Pure strings, no
 * `node:` imports — unlike `main/local-file.ts`, which needs `node:url` to build the
 * `file://` source URL and so can't live here. That module re-exports `LOCAL_FORMAT_ID`,
 * which is where main-process code reads it from.
 */

/** `media.platform_id` for an imported local file. Also its pseudo-platform id. */
export const LOCAL_PLATFORM_ID = "local";

/**
 * `download.format_id` for an imported local file. A value, not a schema column: no
 * migration needed, and `downloadDisplayLabel` already returns `label` verbatim for any
 * format_id other than "legacy".
 *
 * Load-bearing: it is the discriminator for the three delete guards in `DownloadService`
 * (`remove`, `removeDownload`, `start`) that stop Sift deleting the user's original file.
 * Change the row's *label* freely; never its format_id.
 */
export const LOCAL_FORMAT_ID = "local";

/** Tag auto-applied to every import, so local files are one click away in the Library. */
export const LOCAL_TAG = "local file";
