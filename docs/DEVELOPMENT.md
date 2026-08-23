# Development notes

## Layout

- `apps/desktop` — Electron app (`main` / `preload` / `renderer`).
- `packages/core` — framework-free domain code (starts with `branding`).
- `packages/ipc-contract` — the single source of truth for renderer⇄main types.

## Rules

- Renderer never imports Node. It calls `window.sift.*`, typed by `SiftApi`.
- Add IPC: define the channel + type in `packages/ipc-contract`, handle it in
  `apps/desktop/src/main/ipc/`, expose it in `apps/desktop/src/preload/index.ts`.
- Brand strings come only from `@sift/core` `branding`.

## Native modules: rebuilding `better-sqlite3` for Electron's ABI

`better-sqlite3` is a native addon. Its `postinstall` build targets the Node ABI,
not Electron's — so after `pnpm install` (or any Electron version bump) it must be
recompiled against Electron's headers/ABI before the app can load it:

```bash
pnpm install
pnpm --filter @sift/desktop run rebuild   # electron-rebuild -f -w better-sqlite3
```

**Use `run rebuild`, not bare `rebuild`.** `pnpm --filter @sift/desktop rebuild`
(without `run`) is captured by pnpm's own built-in `rebuild` command instead of the
`"rebuild"` script in `apps/desktop/package.json` — same name, different behavior.
pnpm's built-in command relinks the whole dependency tree, which on this repo's
exFAT-formatted volume (no hard-link support) can intermittently fail with
`ERR_PNPM_EISDIR`. `run rebuild` unambiguously invokes the package.json script
(`electron-rebuild`), which only touches `better-sqlite3` and is what you want.
Expect `✔ Rebuild Complete` on success; the compiled addon lands at
`node_modules/better-sqlite3/build/Release/better_sqlite3.node`.

(Root `.npmrc` also sets `package-import-method=copy` for the same exFAT reason —
pnpm's default hardlink/clone import can corrupt linking on filesystems without
hard-link support, so installs there are forced to plain file copies.)

`better-sqlite3` is deliberately left out of `pnpm.onlyBuiltDependencies` in the
root `package.json` — its Node-ABI postinstall build fails on this toolchain and
isn't needed; only the Electron-ABI build from `electron-rebuild` matters.

## Binaries / asset model

Sift manages two external binaries — `yt-dlp` and `ffmpeg` — installed on demand
rather than bundled:

- **Sources** (`packages/binaries/src/sources.ts`, `SOURCES`): one `BinarySource`
  per `BinaryKind` (`"ytdlp" | "ffmpeg"`). `resolveLatest(platform, fetchImpl?)`
  hits the relevant GitHub Releases API (`yt-dlp/yt-dlp`, `BtbN/FFmpeg-Builds`) and
  returns a `ResolvedRelease { version, assetUrl, sha256, binaryName }` — the
  sha256 always comes from the release's published checksum file, never computed
  by us pre-download.
- **Download + verify** (`packages/binaries/src/download.ts`, `downloadAndVerify`):
  streams `assetUrl` to a per-invocation temp file, hashing while writing, and
  only renames into place if the digest matches `expectedSha256`. Any HTTP error
  or hash mismatch deletes the temp file and throws — an unverified binary is
  never left at the destination path.
- **Service** (`apps/desktop/src/main/services/binaries-service.ts`,
  `BinariesService`): `list()` reads installed status from the `asset` DB table
  (no network); `check(kind)` resolves the latest release and compares versions;
  `install(kind)` downloads+verifies (extracting archives for ffmpeg's zip/tar.xz
  builds), then `upsertAsset()`s a row with `{ kind, name, version, path, sha256,
installed_at, last_checked }`. Binaries are stored under
  `app.getPath("userData")/binaries` (`apps/desktop/src/main/paths.ts`).
- **IPC** (`apps/desktop/src/main/ipc/binaries.ts`): `binaries:list` /
  `binaries:check` / `binaries:install`, plus a `binaries:progress` push channel
  for download progress, wired to the Settings → Binaries UI
  (`apps/desktop/src/renderer/routes/settings/binaries-section.tsx`).

## Metadata flow (yt-dlp `-J` → normalize → preview)

Sift never calls the YouTube Data API for metadata — it shells out to the
installed `yt-dlp` binary and normalizes its output:

- **Runner** (`apps/desktop/src/main/sidecars/ytdlp.ts`, `createYtDlpRunner`):
  wraps `execFile` behind the `YtDlpRunner` interface — `dumpJson(url)` runs
  `yt-dlp -J --no-warnings <url>` and `JSON.parse`s stdout; `listExtractors()`
  runs `yt-dlp --list-extractors` and splits stdout into lines. Throws
  `YtDlpNotInstalledError` if no binary is registered yet (`getAsset(db,
"ytdlp")` returns nothing) — surfaced to the renderer as the "Install yt-dlp
  in Settings → Binaries" hint. Failure messages go through
  `ytdlpFailureMessage(action, url, stderr)`: yt-dlp's `ERROR: Unsupported URL`
  is a **normal** outcome (a link from a site with no extractor), so it becomes
  a plain sentence pointing at Settings → Platforms instead of a repeated URL
  plus a stack; every other failure keeps its raw stderr, because auth walls,
  geo-blocks and network errors carry detail the user needs and `isAuthError`
  pattern-matches that very message downstream. Note the raw `execFile` error
  (whose `cmd` contains the user's local cookie path) is kept only as `cause`,
  never in the message — `ipcMain.handle` sends `message` to the renderer.
  **A rejected handler is not a crash:** Electron logs `Error occurred in
handler for 'metadata:fetch'` to the main console for every rejected
  `ipcMain.handle`, which is exactly how this codebase reports IPC errors;
  `HomeView`'s `.catch` renders it as `home-error` and the app stays usable.
  `metadata.spec.ts`'s second test pins that.
- **Normalization** (`apps/desktop/src/main/services/metadata-service.ts`,
  `normalizeMetadata`): maps the loosely-typed raw `-J` object into the
  strongly-typed `MediaMetadata` (`packages/ipc-contract`) — every field is
  coerced to its expected type or `null`, never throws on missing/malformed
  input. `platform` comes from `resolvePlatform(extractor_key)`
  (`packages/core/src/platforms/registry.ts`), which tiers the result
  `"tested"` (curated list in `tiers.ts`, e.g. `youtube` → "YouTube"),
  `"supported"` (any other yt-dlp extractor), or `"unknown"` (no extractor
  key). `hasCaptions` is true if either `subtitles` or `automatic_captions` is
  a non-empty object.
- **Service + IPC** (`MetadataService`, `apps/desktop/src/main/ipc/metadata.ts`
  `registerMetadataIpc`): `metadata:fetch(url)` calls `runner.dumpJson` then
  `normalizeMetadata`; `metadata:listExtractors` proxies `runner.listExtractors`.
- **Renderer**: `UrlInput` (`apps/desktop/src/renderer/routes/home/url-input.tsx`)
  debounces 500ms then calls `window.sift.metadata.fetch(url)`; the result
  renders as `PreviewCard` (`.../home/preview-card.tsx`, `data-testid`
  `preview-card`/`preview-title`/`preview-platform`), errors render as
  `data-testid="home-error"`. Settings → Platforms
  (`.../settings/platforms-section.tsx`, `data-testid="platforms-section"`)
  shows the curated tested-tier list (`listTestedPlatforms()`, badges
  `data-testid="tested-platform"`) plus a searchable list of every extractor
  from `metadata:listExtractors`.

## Download flow (format selection → yt-dlp progress → media row → Library)

Downloading is a straight pipeline from the Home preview card to a persisted
`media` row, with live progress pushed over IPC:

- **Format selection** (`apps/desktop/src/renderer/routes/home/preview-card.tsx`):
  a native `<select>` (`data-testid="download-format"`) offers a fixed preset
  menu — `best | audio | 1080p | 720p | 480p` — not a per-video list parsed from
  `yt-dlp -F`; presets plus yt-dlp's own best-available fallback cover the MVP
  (per-video format enumeration is a later nicety). Each preset maps to a yt-dlp
  `-f` selector string in `FORMAT_SELECTORS`
  (`apps/desktop/src/main/services/download-service.ts`), e.g. `best` →
  `"bv*+ba/b"`, `"720p"` → `"bv*[height<=720]+ba/b"`.
- **Runner** (`apps/desktop/src/main/sidecars/ytdlp.ts`, `createYtDlpRunner().download`):
  spawns `yt-dlp -f <selector> -o <outputTemplate> --no-playlist --newline
--quiet --no-warnings --progress --progress-template "SIFTPROG
%(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.speed)s
%(progress.eta)s" --print after_move:filepath -- <url>` as an arg array (never
  a shell string — the `--` sentinel stops URL-as-flag injection). Every stdout
  line is matched against `PROGRESS_LINE_RE` (`^SIFTPROG (\S+) (\S+) (\S+)
(\S+)$`) by `parseProgressLine`, which converts the 4 captures (downloaded
  bytes, total bytes, speed, eta) to `RawDownloadProgress`, treating yt-dlp's
  `"NA"` sentinel as `null` (e.g. unknown total on a live stream). Any non-empty,
  non-`SIFTPROG` line is kept as the latest `filePathCandidate`; the `--print
after_move:filepath` line is expected to be the final one, giving the real
  on-disk path after any post-processing move. On `close` with exit code 0 and a
  candidate path, resolves `{ filePath }`; otherwise rejects with the last
  stderr line attached.
- **Service** (`DownloadService.start`,
  `apps/desktop/src/main/services/download-service.ts`): builds the output
  template as `<downloadsDir>/<uploader>__<title>.%(ext)s` via
  `buildOutputBaseName` (`@sift/core`, sanitized/length-capped), inserts a
  `media` row with `download_status: "downloading"` _before_ the download
  starts, calls `runner.download(...)` forwarding each progress tick over
  `onProgress` with `mediaId` attached, then on success calls
  `setMediaDownload(db, id, "done", filePath)` or on failure `setMediaDownload(db,
id, "error", null)` and rethrows. `list()` reads all `media` rows, newest
  first, for the Library grid.
- **IPC** (`apps/desktop/src/main/ipc/download.ts`, `ipc/library.ts`):
  `download:start` invokes `DownloadService.start` and fans out each progress
  tick to every open window via a `download:progress` push channel;
  `library:list` invokes `DownloadService.list()`. Both are declared once in
  `packages/ipc-contract` and consumed by main, preload, and renderer.
- **Renderer — Home** (`apps/desktop/src/renderer/App.tsx`,
  `.../home/preview-card.tsx`): clicking `data-testid="download-button"`
  disables the button, clears any prior error, and calls
  `window.sift.download.start(...)`; a `window.sift.download.onProgress`
  subscription (mounted once, independent of the in-flight download) updates an
  animated progress bar (`data-testid="download-progress"` — indeterminate
  stripe until the first tick with a known `total`, then a percent-width fill).
  On success, `data-testid="download-done"` renders ("Saved to Library"); on
  failure the message renders as `data-testid="home-error"` (same slot the
  metadata-fetch error uses). single active download at a time —
  concurrency/queue is Phase 7.
- **Renderer — Library** (`.../library/library-page.tsx`, `.../library-table.tsx`,
  `.../media-card.tsx`): as of Phase 6 Redesign Part B, a **table is the
  default view** (`data-testid="library-table"`, one `data-testid="library-row"`
  per media item) with a **Tiles** toggle (`data-testid="library-view-tiles"` /
  `"library-view-table"`) that switches to the original card grid
  (`data-testid="library-grid"` of `MediaCard`s, `data-testid="media-card"`).
  The chosen view persists across sessions in `localStorage`
  (`apps/desktop/src/renderer/lib/library-view.ts`, key `"sift.libraryView"`,
  defaulting to `"table"` for any unset/invalid value). Both views read the
  same `MediaListItem[]` from `library:list` (title, transcript
  count/language, per-format download badges, summary count) and share the
  same `media-open`/`media-remove`/`media-remove-confirm` actions — see
  "Library depth" below for what Details opens into. Table columns are Video,
  Channel, Length, Platform, Transcript, Formats, Summaries, Added, actions;
  **Channel** (`data-testid="library-row-channel"`) is a button calling
  `onOpenChannel(media.id)` when the source is YouTube (same gate
  `media-detail.tsx` uses — `channels.openForMedia` resolves a channel URL from
  the stored yt-dlp dump and the in-app Channels page is YouTube-shaped);
  otherwise it opens the uploader's page on the source platform (an X profile, a
  Vimeo user) in the default browser via `library:openExternal`, marked
  `data-external="true"` and suffixed `↗`. That URL is `MediaRecord.uploaderUrl`
  (yt-dlp's `uploader_url`, stored on `media` since day one and surfaced to the
  renderer for this), filtered through `externalLinkUrl()` in
  `renderer/lib/utils.ts` — **an http(s)-only gate, not tidiness**: the value
  comes off a scraped page, and `shell.openExternal` would otherwise happily
  launch a `file:` path or a registered custom-protocol handler. Extractors that
  report no uploader URL fall back to plain text. **Length**
  (`data-testid="library-row-duration"`) is its own column;
  neither is stacked under the title any more. **Formats** always shows the
  _quality_ you have on disk (`1080p`, `audio`), falling back to the container
  (`MP3`) only when there is genuinely no video — see the poster/height note in
  "Local file import" for how an imported row gets its resolution. Remove is an
  icon-only trash button in both views (`aria-label`/`title` carry the label);
  the confirm step keeps its text, because a destructive confirmation shouldn't
  be a second unlabelled glyph. Fetched fresh via
  `library:list` every time the view mounts (i.e. every time the user clicks
  "Library" in the header nav). Empty state renders
  `data-testid="library-empty"`.
- **Downloads directory** (`apps/desktop/src/main/paths.ts`, `downloadsDir()`):
  `downloadsDir()` returns the default — the OS "Downloads" folder plus the
  branded app subfolder. That default is only the fallback for the
  downloads-config store (`downloadsConfigFile()`), which holds the live,
  user-overridable path. Settings → Downloads
  (`renderer/routes/settings/downloads-section.tsx`) edits it via
  `downloads:getPath`/`setPath`/`pickPath`; `DownloadService.downloadsDir` reads
  the store live, so a changed path takes effect on the next download.

### Offline download e2e fixture

`apps/desktop/e2e/download.spec.ts` exercises the whole pipeline above — URL →
preview → format pick → Download click → progress → `done` → Library row —
without a real yt-dlp binary or network access, reusing the same
`SIFT_E2E_FIXTURE_DIR` hook as the metadata e2e (see below). Two additions in
`main/index.ts` make this offline-safe:

- `fixtureYtDlpRunner().download(_opts, onProgress)` emits two canned progress
  ticks (`{received:512,total:1024,speed:256,eta:2}` then
  `{received:1024,total:1024,speed:256,eta:0}`) synchronously and resolves
  `{ filePath: "<temp>/sift-e2e-downloads/Fixture Channel__Fixture Video
Title.mp4" }` — no `spawn`, no real file is written. The base name
  (`"Fixture Channel__Fixture Video Title"`) matches what
  `buildOutputBaseName` would produce from `FIXTURE_METADATA_JSON`'s `uploader:
"Fixture Channel"` / `title: "Fixture Video Title"`, so the fixture path stays
  consistent with the real naming convention even though nothing is actually
  downloaded.
- `DownloadService` is constructed with `downloadsDir:
join(app.getPath("temp"), "sift-e2e-downloads")` whenever the
  `SIFT_E2E_FIXTURE_DIR` branch is active, instead of the real `downloadsDir()`
  — so `mkdirSync(downloadsDir, { recursive: true })` in `DownloadService.start`
  never touches a real user's `Downloads` folder during e2e.

Because the fixture stub resolves both progress ticks synchronously before the
renderer's IPC `invoke` promise even settles, the intermediate
`download-progress` frame can be too fast to reliably assert on — the spec
asserts the terminal `download-done` state instead (Playwright's default
web-first `toBeVisible()` polling), matching the guidance already used by
`metadata.spec.ts`.

**Real-download human-test caveat:** the offline e2e proves the UI/IPC/DB
pipeline end-to-end, but it never spawns a real `yt-dlp` process, so it cannot
verify the exact stream/flag behavior of the real binary — e.g. whether
`--progress-template` output actually arrives on `stdout` vs `stderr` on a given
platform, or whether `--print after_move:filepath` is reliably the last
non-progress line for every extractor. `parseProgressLine` itself is
unit-tested against canned `SIFTPROG` lines
(`apps/desktop/src/main/sidecars/ytdlp.test.ts`), but the wiring against a real
binary needs one human tuning pass: paste a real public URL into Home, try each
format preset, and confirm (a) the file lands in `Downloads/<App>`, (b) the
progress bar visibly tracks (not just jumps 0→100), and (c) the Library row
flips from `downloading` to `done`. This is tracked as a Phase 3 follow-up, not
a gap in the automated suite.

## Local file import (drop/pick → skip download → transcribe)

A media file the user already has on disk can be dropped onto the window (or chosen
via a picker) to become library media and go straight to transcription — no yt-dlp
call, no download stage:

- **Shared constants** (`packages/core/src/media/local.ts`): `LOCAL_PLATFORM_ID`
  (`"local"`, the `media.platform_id`), `LOCAL_FORMAT_ID` (`"local"`, the
  `download.format_id` — see "Design decisions" below) and `LOCAL_TAG`
  (`"local file"`, auto-applied on import). They live in core because **both**
  processes need them: main stamps them onto rows, the renderer styles, sorts and
  labels by them. `main/local-file.ts` re-exports `LOCAL_FORMAT_ID`, so
  main-process code keeps importing it from there.
- **Helpers** (`apps/desktop/src/main/local-file.ts`):
  `isLocalFileUrl(url)` (true for `file:` URLs — the identity key for imported
  media), `filePathFromUrl(url)` (`fileURLToPath`, the inverse),
  `posterSeekSeconds(durationSec)` (see the poster bullet below), and
  `localFileMetadata(absPath, durationSec?)`, which synthesizes a full
  `MediaMetadata` with no yt-dlp involved: `sourceUrl` is
  `pathToFileURL(absPath).href`, `platform: { id: "local", label: "Local file",
tier: "tested" }` (the pseudo-platform is built here rather than added to the
  curated `TESTED_PLATFORMS` list of real yt-dlp extractor keys, since `"tested"`
  here only suppresses the UI's "this platform is untested" caution, not a claim
  about yt-dlp coverage), and `hasCaptions: false` — load-bearing, since it makes
  `ytdlp-subs`'s `canHandle` false, so provider resolution falls straight through to
  Whisper with no change to any provider or to `resolveTranscriptProvider`.
  Deliberately **not** in `@sift/core`: it needs `node:url` for correct Windows
  path→URL encoding (drive letters, backslashes, spaces, non-ASCII), and core has
  zero `node:` imports because the renderer imports it directly. It also
  deliberately skips `../paths` (which imports `electron`), matching
  `download-service.ts`/`metadata-service.ts`, so it stays loadable under plain
  Node for its own Vitest suite.
- **Service** (`DownloadService.importLocal`,
  `apps/desktop/src/main/services/download-service.ts`): rejects if the file no
  longer exists, then finds-or-creates the identity `media` row by the `file://`
  source URL (same find-or-create as `start()`) and upserts a `download` row with
  `format_id: LOCAL_FORMAT_ID`, `status: "done"`, and `file_path` set to **the
  user's own path** — imports are referenced in place, never copied. That done row
  is the whole trick: `TranscriptService` reads it as `audioPath`, exactly what
  Whisper's `canHandle` requires, and `sift-media://` gates on download-table
  membership rather than a path prefix, so the file plays in-app from wherever it
  lives. Re-importing the same path is idempotent — same media row, same download
  row upserted. Two things are set for presentation: the row's **label** is the
  probed video `height` as `"1080p"` when the renderer could read one, else the
  container (`"MP3"`, `"M4A"`), so the Library's Formats column shows a _format_
  and an imported row reads exactly like a downloaded one; and `LOCAL_TAG` is
  added here rather than in the renderer, so both entry points (drop and picker)
  get it for free (`addTag` is `INSERT OR IGNORE` over a `NOCASE` column, so
  re-import stays idempotent). The **`format_id` never moves** — it is the delete
  guard's discriminator; only the label changes.
- **Delete guard** (`remove()` / `removeDownload()`, same file): both skip the
  on-disk unlink when `d.format_id === LOCAL_FORMAT_ID`, before deleting the DB row
  either way. See "Design decisions" below for why this isn't cleanup work.
- **Metadata short-circuit** (`MetadataService.fetch`,
  `apps/desktop/src/main/services/metadata-service.ts`): the first line of `fetch`
  checks `isLocalFileUrl(url)` and returns `localFileMetadata(filePathFromUrl(url))`
  with no yt-dlp call. `media-detail.tsx`'s `ensureMetadata()` — the single choke
  point every transcribe/summarize/retry-download action in the detail view routes
  through — calls `metadata:fetch(media.sourceUrl)` unconditionally; because the
  short-circuit lives inside the service, the renderer needs **no branch** for
  imported media, it just works. `durationSec` comes back `null` on this path
  deliberately: it's display-only, already persisted on the media row at import
  time, and nothing downstream reads `metadata.durationSec` — a DB lookup here
  would give a framework-free service a database dependency.
- **IPC** (`apps/desktop/src/main/ipc/import.ts`, `registerImportIpc`):
  `import:local` invokes `DownloadService.importLocal`, letting errors propagate
  (`ipcMain.handle` → rejected renderer `invoke()`). `import:pick` opens
  `dialog.showOpenDialog` filtered to `MEDIA_EXTENSIONS` (`packages/core`, shared
  with the renderer's drop filter), multi-select, dialog options hoisted to one
  `dialogOpts` const shared by both the parented and unparented branches
  (`summarize.ts`'s export/import dialogs are the house shape for this). The
  filter is advisory only — Windows lets a user type any path into the filename
  box past it — so the two entry points staying in sync is enforced on the
  renderer side (`pick()`, below), not by the filter alone. `registerImportIpc`
  takes a `deps` object (`{ getWindows, db, ffmpeg, postersDir }`, wired in
  `main/index.ts` next to `registerDownloadIpc`); the dialog is parented to the
  first window so it's app-modal, matching `frames.ts`/`summarize.ts`. Returns
  `[]` on cancel.
- **Poster frame** (`attachPoster`, same file): after `importLocal` returns, one
  `ffmpeg.extractFrameAt` writes `userData/posters/<mediaId>.jpg` and
  `setMediaThumbnail` points the media row at it, so imported rows aren't stuck on
  the empty-poster state. The seek point is `posterSeekSeconds(durationSec)` —
  **10% of duration, clamped to `[5s, 120s]`**: proportional handles a 90-second
  clip and a 3-hour lecture with one rule, the floor skips black frames and
  fade-ins, the ceiling stops a long video's poster being buried mid-video, and
  it's deterministic so a re-import doesn't silently change the thumbnail.
  Duration comes from the renderer's pre-import probe, so nothing extra is read.
  **It never throws**: ffmpeg is an on-demand managed binary (absent on first run)
  and audio files have no video stream — a missing thumbnail must never fail an
  import, so a failure just leaves `thumbnail_path` null. It re-extracts on every
  import rather than reusing an existing `<mediaId>.jpg`, because SQLite reuses
  the last rowid after a delete and a cached file could otherwise be served as a
  _different_ import's poster.
- **Resolution backfill** (`backfillHeightFromPoster`, same file): the poster is
  encoded at the source frame size, so `jpegSize()` (a SOFn-marker read in
  `local-file.ts`) recovers the video's height from it and relabels the download
  row `"<h>p"` when the renderer's probe couldn't supply one. That gap is not an
  edge case: the **picker path has no `File` object to probe at all**, and
  Chromium refuses to decode plenty of containers (MKV, some HEVC). Without it
  the Formats column reads `MP4` for an imported video next to `2160p` for a
  downloaded one — a container and a resolution in the same column. It only fills
  a gap; a height the renderer already reported wins. **Both this and the poster
  run at import time only** — rows imported before this shipped keep their old
  label and empty poster until the file is dropped in again (re-import is
  idempotent: same media row, same download row, now relabelled).
- **`sift-poster://` protocol** (`main/index.ts`, registered privileged before
  app-ready alongside `sift-thumb`/`sift-media`/`sift-frame`): serves
  `sift-poster://file/<encodeURIComponent(abs path)>`, gated on
  `mediaExistsByThumbnailPath` + `existsSync` — the same allowlist posture as
  `sift-frame`. It needs its own scheme: `sift-thumb` is a remote-URL cache with a
  host allowlist and can't serve a local path, and `sift-frame` gates on the
  `frame` table, which belongs to the Slides flow. The renderer's
  `videoThumbUrl()` (`renderer/lib/utils.ts`) routes any non-`http(s)`
  `thumbnail_path` through it; `index.html`'s CSP `img-src` lists `sift-poster:`.
- **Renderer — hook** (`apps/desktop/src/renderer/lib/use-file-import.ts`,
  `useFileImport(onDone)`): wires `dragover`/`dragleave`/`drop` on `window`.
  `dragover` and `drop` are gated on `e.dataTransfer.types.includes("Files")`
  (`dragleave` is not — it only ever clears the overlay) so a dropped link or plain
  text falls through to the browser's own default handling (e.g. filling the
  Home URL input) instead of being blocked — `main/index.ts`'s `will-navigate`
  handler on the window's `webContents` is the backstop that keeps that
  fallthrough from ever navigating the app away. For a "Files" drag,
  `preventDefault` on both `dragover` and `drop` is what stops Electron's default
  behavior of navigating the window to the dropped file. `pick()` re-runs picked
  paths through `partitionDropped` too (see below), so the native picker rejects
  a non-media file with the same notice the drop path does, rather than letting
  it fail later inside Whisper. Dropped/picked files run through `runImports`,
  strictly one at a time, each calling `import.local` → `metadata.fetch` →
  `transcript.get` in sequence. `import.local` is what commits the library row,
  so that's tracked separately (as "landed") from a successful transcribe:
  `onDone()` (navigates to Library) fires once at least one file _landed_, even
  if every transcribe in the batch failed — Whisper is an on-demand binary, not
  installed by default, so a failed transcribe on a fresh install is the common
  case, not an edge case, and the row must still be visible. Each per-file
  transcribe failure is reported but doesn't abort the batch, and is joined with
  the caller's own classification notice (e.g. a `.zip` in the same drop) into
  one combined error message so neither overwrites the other. A `running` ref
  (not state, so the drag-listener effect only depends on `runImports` and
  registers its listeners exactly once) rejects a second drop/pick while a batch
  is in flight — this is load-bearing, not just UX polish: `TranscriptService`
  only dedupes in-flight jobs per `sourceUrl`, so two _different_ files dropped
  together would otherwise both launch a Whisper run concurrently. Classification
  is delegated to a pure, exported `partitionDropped(files)` helper — DOM-free so
  it's unit-testable without jsdom (`use-file-import.test.ts`) — which sorts each
  file into accepted, "not a media file" (fails `isMediaFile`), or "couldn't read
  where it lives on disk" (`File.path` missing — see the `ponytail:` note on
  `droppedPath` for why that's Electron-version-sensitive), and returns one
  combined notice string covering everything skipped so a mixed batch never
  silently loses part of itself. `onDrop` re-pairs `partitionDropped`'s accepted
  entries back to their `File` objects (same filter, same order) to run
  `probeMedia` — a throwaway `<video>` element that reads a file's duration **and
  `videoHeight`** off one `onloadedmetadata`, failing safe to nulls on decode error
  or a 5s timeout, no ffprobe involved. Duration drives the poster seek point,
  height the format label. The hook's `busy` is an `ImportProgress`
  (`{ name, index, total, stage, ratio }`), not a bare filename: it carries the
  1-based batch position and, via a `window.sift.transcript.onProgress`
  subscription, the live stage + ratio of the transcribe now running.
- **Renderer — overlay** (`apps/desktop/src/renderer/components/drop-overlay.tsx`,
  rendered by `App()` so a drop works from any view): a full-window affordance
  while dragging (`data-testid="drop-overlay"`, "Drop to transcribe"), a busy
  **card** for the whole import-and-transcribe span (`data-testid="import-busy"`),
  and an error line (`data-testid="import-error"`). The card is fixed
  bottom-right, solid, with the filename, "File 2 of 5" for multi-file drops, a
  progress bar (`data-testid="import-progress"`) and the stage text from
  `transcriptStageLabel()`. That shape is deliberate: this span can run several
  minutes under a real Whisper model, and the previous faint inline `<p>` at
  default opacity — static for the whole run — read as a frozen app. The moving
  percentage is the part that says "not frozen"; with no ratio yet (extracting
  audio, or a provider that doesn't report one) the bar is a pulsing sliver rather
  than a 0% bar. `HomeView` additionally shows a `data-testid="home-drop-hint"`
  line with a `data-testid="home-pick-file"` button for the native picker, for
  anyone who doesn't know they can drag onto the window.
- **Renderer — Library markers**: imported rows carry a left amber accent plus a
  faint tint in **both** views — `library-table.tsx`'s `LibraryRow` and
  `media-card.tsx` (`data-local="true"` on each) — branching on
  `media.platformId === LOCAL_PLATFORM_ID`. A light tint rather than a strong
  background, because rows already have a hover tint and heavier fill fights the
  tag badges. `LOCAL_TAG` gets an explicit loud-amber override in
  `lib/tag-color.ts` (checked ahead of the name hash) and sorts first in the
  Library's tag filter bar (`library-page.tsx`'s `filterTags` — a stable sort in
  the renderer, so `listAllTags`'s SQL ordering stays generically alphabetical).
  `downloads-panel.tsx` shows an imported row as **"Imported"**, not "Downloaded",
  and carries the line "Removes the library entry — your file stays where it is";
  the same reassurance appears next to Confirm remove in both Library views
  (`LOCAL_REMOVE_NOTE`). Files imported before auto-tagging shipped are covered by
  `backfillPlatformTag(db, LOCAL_PLATFORM_ID, LOCAL_TAG)` in `initDb()` — an
  `INSERT OR IGNORE … SELECT`, safe on every launch, not a schema migration.

### Offline import e2e

`apps/desktop/e2e/import.spec.ts` writes a throwaway `.mp4` (contents don't
matter — the fixture Whisper provider only requires a `done` download row to
exist) and drives the same pipeline the drop handler drives, directly from the
page context: `window.sift.import.local({ path, durationSec })` →
`window.sift.metadata.fetch(record.sourceUrl)` →
`window.sift.transcript.get({ metadata })`. It does this rather than a real
`DataTransfer` drop because a Playwright-constructed `File` can't carry
Electron's `path` through a synthetic drag event (see the human-test caveat
below). It then navigates to Library, asserts the row appears, opens it, and
asserts the transcript renders — using `media-detail-transcript-segment`, the
Library detail view's own test id (`routes/library/transcript-panel.tsx`), not
the Home-flow `transcript-segment` used by `transcript.spec.ts`.

**Human-test caveat:** the drag gesture and the native picker have no automated
coverage — a Playwright-constructed `File` can't carry Electron's non-standard
`path` through a synthetic `DataTransfer`, and the picker dialog is app-modal,
outside Playwright's reach. A human pass must verify:

1. Dragging a media file over the window shows the "Drop to transcribe" overlay.
2. Dropping it imports, transcribes, and lands in the library.
3. Dropping a `.zip` shows `Not an audio or video file: <name>` and imports nothing.
4. **A mixed drop of a media file plus a `.zip` still shows the rejection
   notice** — `partitionDropped`'s classification is unit-tested for exactly this
   case (`use-file-import.test.ts`), but nothing exercises the real `drop` event
   end-to-end (same `File.path`-via-`DataTransfer` limitation as above), so a
   regression in `onDrop`'s wiring specifically — not the classification logic —
   would silently skip files with no test catching it.
5. The "choose a file" button opens the native picker; cancelling does nothing.
6. Deleting an imported item from the library leaves the original file on disk.
7. Pressing Esc mid-drag dismisses the overlay rather than leaving it stuck.
8. **Drag a file slowly across the window over several UI elements — the
   overlay must stay solid, not flicker.** `onDragLeave`'s `relatedTarget ===
null` check is a shaky "left the window" test in Chromium; if it flickers,
   the fix is a dragenter/dragleave depth counter.
9. **Drag a link from a browser into the window — the app must not navigate
   away**, and the Home URL input should still accept a dropped URL normally.
10. **The import card shows a moving percentage** during a real Whisper run (it is
    driven by `transcript:progress`, which the offline fixture resolves
    synchronously — so only a real run exercises it), and multi-file drops count
    "File N of M".
11. **An imported video gets a poster thumbnail** in the Library once ffmpeg is
    installed, and importing with ffmpeg _not_ installed still succeeds with no
    thumbnail rather than failing.

### Design decisions

- **The `remove`/`removeDownload` delete guard is not dead code to clean up.**
  Imported downloads reference files where the user already keeps them, not a copy
  in the downloads dir — removing the `format_id === LOCAL_FORMAT_ID` check would
  make deleting a library item delete the user's original file. `start()`'s
  prior-file unlink (on a same-format re-download) carries the identical guard as
  belt-and-braces: `computeDownloadOptions` never emits a `DownloadOption` with id
  `"local"`, so it's unreachable today, but the failure mode of getting it wrong is
  the same permanent deletion, on a line that's cheap to guard. All three unlink
  sites in `download-service.ts` now read the same way.
- **`format_id: "local"` is deliberately a value, not a schema column.** No
  migration was needed to add it, and it slots into `downloadDisplayLabel`'s
  existing non-`"legacy"` path (`d.format_id !== "legacy"` returns `d.label`
  verbatim) with no extra branch needed. It doubles as the discriminator the
  delete guard above checks. Its downgrade hazard is worth stating once: an older
  Sift build has no delete guard, so a user who imports files and then rolls back
  to a pre-import version would have their originals deleted by "Remove from
  library". Inherent to marker-in-a-value; note it in the release entry.
- **The poster gets its own protocol scheme rather than reusing an existing one.**
  `sift-thumb://` is a remote-URL cache with a host allowlist and rejects both
  arbitrary hosts and non-https (`services/thumbnail-cache.test.ts`), so it cannot
  serve a local path at all. `sift-frame://` would work mechanically but requires
  registering the poster in the `frame` table, polluting the Slides flow with rows
  that aren't slides. `sift-poster://` mirrors the three existing schemes exactly
  and gates on `media.thumbnail_path` membership — ~20 lines, no new concepts.
- **Poster extraction lives in the IPC layer, not `DownloadService`.** The service
  is deliberately loadable under plain Node for its Vitest suite and has no ffmpeg
  dependency; putting the grab in `main/ipc/import.ts` keeps it that way, and both
  entry points still get it because both go through `import:local`.

## Transcript flow (registry → `ytdlp-subs` provider → VTT parsing → transcript row)

Phase 4a adds "Get transcript" for captioned videos. The design is a provider
registry so a second (local, audio-based) provider can be added later without
touching the resolution call site:

- **Types** (`packages/core/src/transcript/types.ts`): `TranscriptSegment {
start, end, text }` (seconds, float); `TranscriptContext { sourceUrl,
hasCaptions, language, audioPath }` — `audioPath` is always `null` in 4a and
  only meaningful once a local (Whisper) provider exists; `TranscriptResult {
providerId, language, text, segments, model }`; `TranscriptProvider { id,
label, canHandle(ctx), transcribe(ctx, onProgress) }`.
- **Registry** (`packages/core/src/transcript/registry.ts`,
  `TranscriptRegistry`): an ordered list of providers. `register()` replaces
  an existing provider with the same `id` (idempotent re-registration) or
  appends. `resolve(ctx)` returns the **first** provider whose `canHandle(ctx)`
  is true, or `null` — first-match-wins, so registration order _is_ the
  resolution order. Two providers register today
  (`apps/desktop/src/main/index.ts`):
  ```ts
  transcriptRegistry.register(createYtdlpSubsProvider({ runner }));
  transcriptRegistry.register(
    createWhisperProvider({ ffmpeg, whisper, isInstalled }),
  );
  ```
  The Whisper provider registers _after_ `ytdlp-subs`, and its `canHandle` is
  true only when a downloaded audio file exists **and** the binary + model are
  installed, so "if captions exist → fast free subtitle pull, else → local
  transcription" falls out of the registry's ordering for free; no branching
  logic needs to change in `TranscriptService`.
- **`ytdlp-subs` provider** (`apps/desktop/src/main/transcript/ytdlp-subs-provider.ts`,
  id `"ytdlp-subs"`, exported as `YTDLP_SUBS_ID`): `canHandle(ctx)` is just
  `ctx.hasCaptions` (set by `normalizeMetadata` from yt-dlp's `subtitles`/
  `automatic_captions`). `transcribe()` makes a fresh `mkdtempSync` scratch
  dir, calls `runner.fetchSubtitles({ url, language, outputDir })`, reads the
  returned `.vtt` off disk, and runs it through `parseVtt()`; the scratch dir
  is always removed in a `finally`, success or failure. Throws `"No <lang>
captions available for this video"` if the runner returns `null` (yt-dlp
  exited 0 but wrote no subtitle file — e.g. the caption track disappeared
  between metadata fetch and transcribe).
- **VTT parsing** (`packages/core/src/transcript/vtt.ts`): `parseVtt(vtt)`
  splits WebVTT on blank lines, finds the `HH:MM:SS.mmm --> HH:MM:SS.mmm` cue
  line per block (also accepts `MM:SS.mmm` and comma decimals), strips
  `<...>` inline tags from the cue text, collapses whitespace, and **drops a
  cue if its text is identical to the immediately preceding one** — this
  covers YouTube's "rolling" auto-caption style where the same line is
  repeated across several cues while a new line scrolls in. no
  word-timing reconstruction or cross-cue overlap de-dup beyond that; add only
  if a real broken-transcript report needs it. `segmentsToText(segments)`
  joins segment text with `\n` for the flat `TranscriptRecord.text` field.
- **Runner** (`apps/desktop/src/main/sidecars/ytdlp.ts`,
  `createYtDlpRunner().fetchSubtitles`): runs `yt-dlp --skip-download
--write-subs --write-auto-subs --sub-langs "<lang>.*" --sub-format vtt
--convert-subs vtt --no-playlist --no-warnings -o
"<outputDir>/subs.%(ext)s" -- <url>` (via `exec`, not `spawn` — subtitle
  fetch has no meaningful progress stream to parse) then picks the first
  `*.vtt` file in `outputDir`. caller always hands it a fresh temp
  dir, so "first `.vtt` on disk" is unambiguous for a single language; exact
  per-language filename matching (yt-dlp writes `subs.en.vtt`,
  `subs.en-US.vtt`, etc.) lands only if multi-language selection is added.
  Language is fixed to `"en"` end-to-end today — a language picker is a later
  nicety.
- **Storage** (`packages/db/src/transcript.ts`, migration
  `003-transcript.sql.ts`): a `transcript` table (`media_id`, `provider_id`,
  `language`, `text`, `segments_json`, `model`, `created_at`), one row per
  transcribe call, keyed to a `media` row via `media_id`. `insertTranscript`/
  `getTranscriptsByMediaId` (newest first) are the only accessors the service
  needs.
- **Service** (`apps/desktop/src/main/services/transcript-service.ts`,
  `TranscriptService.get`): **find-or-create** the `media` row for
  `metadata.sourceUrl` via `getMediaBySourceUrl` — if none exists yet it
  inserts one with `download_status: "none"` (a transcript-only job never
  downloads the video, so this media row can exist without ever appearing as
  a completed download). `fromMetadata`'s camel→snake mapping is
  ~duplicated from `DownloadService`'s private one (only `download_status`
  differs); unify into a shared `@sift/db` helper only if a third caller
  appears. **Idempotent**: if a transcript already exists for that media row,
  returns the newest one (`getTranscriptsByMediaId(...)[0]`) without
  re-invoking any provider — repeat "Get transcript" clicks are free. Otherwise
  resolves a provider from the registry (`registry.resolve(ctx)`); if none can
  handle it (no captions, and Whisper not installed or the video not
  downloaded), throws `"No captions found. Install Whisper (Settings →
Binaries) to transcribe downloaded videos locally."` (the media row is left
  in place so a later Whisper run can attach a transcript to it). On success, persists the
  result via `insertTranscript` and returns the mapped `TranscriptRecord`.
- **IPC** (`apps/desktop/src/main/ipc/transcript.ts`, `packages/ipc-contract`):
  a single `transcript:get(input: { metadata })` handler; errors (including
  "no captions found") are left to propagate so `ipcMain.handle` turns them
  into a rejected renderer-side `invoke()` — no separate error channel.
- **Renderer** (`apps/desktop/src/renderer/App.tsx`,
  `.../home/preview-card.tsx`, `.../home/transcript-panel.tsx`): the preview
  card always shows `data-testid="transcript-button"` ("Get transcript" /
  "Transcribing…"), regardless of whether the fetched metadata has captions.
  Clicking it on a caption-less video still creates/finds the `media` row
  (with `download_status: "none"`) and then surfaces the "No captions" error
  below (or, once the video is downloaded and Whisper is installed, the Whisper
  provider transcribes it). `handleTranscribe` calls
  `window.sift.transcript.get({ metadata })`; on
  success `TranscriptPanel` renders (`data-testid="transcript-panel"`,
  header "Transcript · `<providerId>`"), one `data-testid="transcript-segment"`
  row per segment with a `mm:ss` timestamp and the segment text; on failure
  the message renders as `data-testid="transcript-error"`. no
  streaming progress on the Home subtitle path — subtitle fetch is a few
  seconds, so there's no intermediate UI state. `transcript:progress` events +
  a progress bar drive the longer Whisper path (see the Whisper section).

### Offline transcript e2e fixture

`apps/desktop/e2e/transcript.spec.ts` exercises the whole pipeline above — URL
→ preview → click "Get transcript" → fetch subs → parse VTT → persist →
transcript panel — without a real yt-dlp binary or network access, reusing the
same `SIFT_E2E_FIXTURE_DIR` hook as the metadata/download e2e specs (see
below). One addition in `main/index.ts`'s `fixtureYtDlpRunner()` makes this
offline-safe: `fetchSubtitles({ outputDir })` writes a canned two-cue
`FIXTURE_VTT` ("Fixture caption line one" / "Fixture caption line two") to
`<outputDir>/subs.vtt` and returns that path — no `exec`, no network.
`FIXTURE_METADATA_JSON` already sets `automatic_captions: { en: [{}] }`, so
the normalized preview has `hasCaptions: true` and the "Get transcript" button
renders, and `ytdlp-subs`'s `canHandle` passes. The spec asserts the terminal
`transcript-panel` state (visible, first `transcript-segment` contains
"Fixture caption line one") rather than any mid-flight state, since the
fixture stub resolves synchronously — same reasoning as `download.spec.ts`'s
`download-done` assertion.

**Real-transcript human-test caveat:** the offline e2e proves the UI/IPC/DB
pipeline end-to-end, but it never spawns a real `yt-dlp` process, so it cannot
verify the exact subtitle output behavior of the real binary — e.g. the exact
filename yt-dlp writes for a given language/extractor (Task 3 note:
`fetchSubtitles` picks the first `*.vtt` on disk, which is unambiguous only
because the caller always hands it a fresh directory), or whether YouTube's
anti-bot measures require cookie-based auth for subtitle downloads (tracked in
the product spec, §8.8) the way they sometimes do for regular downloads.
`parseVtt` itself is unit-tested against canned VTT text
(`packages/core/src/transcript/vtt.test.ts`), but the wiring against a real
binary needs one human tuning pass: paste a real captioned public URL into
Home, click "Get transcript", and confirm segments render with sensible
timestamps and readable text. This is a Phase 4a/8 follow-up, not a gap in
the automated suite.

**Local transcription (no captions) is handled by the Whisper provider**
(registered after `ytdlp-subs`). When Whisper is _not_ installed, a
caption-less video gets a clean `"No captions found. Install Whisper
(Settings → Binaries) to transcribe downloaded videos locally."` error
(`transcript-error` in the UI) instead of a
transcript — this is the expected, tested behavior of the registry,
not a bug.

### Transcript language preference

Videos aren't always fetched in English: `MediaMetadata` now carries a
detected `language: string | null` and a `captionLanguages: string[]` (the
tracks yt-dlp actually found), and `pickTranscriptLanguage({ videoLanguage,
available, preferred })` (`packages/core`) resolves which one to fetch —
detected-language-wins if it's among the available tracks, otherwise the
first entry of the caller's `preferred` list that's available, falling back
to `"en"`. `TranscriptService` calls this before invoking a provider so the
detected/preferred logic is centralized rather than duplicated per provider.
The `preferred` list itself is user-configurable: `createTranscriptConfigStore`
(`apps/desktop/src/main/settings/transcript-config.ts`) persists it as
`{ languages: string[] }` in `transcript.json` (default `["en"]`,
corruption-safe — a malformed file just falls back to the default rather than
throwing), exposed to the renderer via the `settings:getTranscriptLanguages`/
`settings:setTranscriptLanguages` IPC pair (and `window.sift.settings.*` in
the preload). The Settings page's "Transcript language" section
(`transcript-language-section.tsx`) renders the ordered list, lets the user
add a language code, remove one, or reorder the list (first = default),
persisting on every change; its elements carry the testids
`transcript-language-section`, `transcript-language-row` (one per language),
`transcript-language-input`, `transcript-language-add`, and
`transcript-language-remove`. `apps/desktop/e2e/transcript-language.spec.ts`
round-trips this offline: it confirms the default single English row, adds
Polish via the input + add button, and asserts the row count and "Polish"
label update — reusing the same `SIFT_E2E_FIXTURE_DIR` isolation as the other
e2e specs.

### Transcript export (`.srt`)

Any timestamped transcript can be exported as standalone SubRip subtitles, independent of
summarize/download:

- **Serializer** (`packages/core/src/transcript/srt.ts`, `segmentsToSrt`): pure, dependency-free.
  Drops blank segments without gapping the cue numbering, and gives a cue whose `end` isn't after
  its `start` a one-second minimum duration (some players silently discard zero-length cues, and
  auto-caption segments occasionally carry equal start/end times). Returns `""` for zero usable
  cues — the caller treats that as "nothing to export".
- **Service** (`apps/desktop/src/main/services/transcript-service.ts`, `TranscriptService.exportSrt`):
  loads the transcript row, parses `segments_json`, and throws `"This transcript has no
timestamps, so it can't be exported as subtitles."` if `segmentsToSrt` comes back empty (a
  caption source can produce text with no segments). Otherwise writes
  `<base>__transcript-<providerId>.srt` under the downloads dir (same `buildOutputBaseName` +
  `sanitizeFilename` naming helper as every other export) and returns the absolute path.
- **IPC** (`transcript:exportSrt`, `apps/desktop/src/main/ipc/transcript.ts`,
  `apps/desktop/src/preload/index.ts`'s `transcript.exportSrt`): a single
  `transcriptId → Promise<string>` call; errors (including "no timestamps") propagate as a
  rejected `invoke()`.
- **Renderer** (`apps/desktop/src/renderer/routes/library/transcript-panel.tsx`,
  `media-detail.tsx`'s `handleExportSrt`): each transcript card has a
  `data-testid="transcript-export-srt-<id>"` button, disabled when `segments.length === 0` (so
  a flat-text-only transcript never offers an export that would just throw). On success the
  written file is revealed via `library.reveal(path)`, same as other file-producing actions.
  `.srt` exports don't appear in the Files tab (they're written straight to the downloads dir,
  not tracked as a `document` row) — a later nicety, not a gap in this flow.

## Summarize flow (AI registry → Anthropic streaming → prompt assembly → summary row → export)

Phase 5a adds "Summarize" for videos with a transcript. Like the transcript
registry, the design is a provider registry so OpenAI/Ollama/custom providers
(Phase 5b) can be added later without touching the resolution call site:

- **Types** (`packages/core/src/ai/types.ts`): `AiModelInfo { id, label }`;
  `SummarizeInput { model, systemPrompt, content, maxTokens }` — `content` is
  the fully-assembled user message (prompt body + transcript, see
  `assembleSummaryContent` below); `AiTokenFn = (delta: string) => void`;
  `AiProvider { id, label, needsKey, models(), summarize(input, onToken) }`.
  `id` is a stable string (`"anthropic" | "openai" | "ollama" | "custom"`,
  all four registered as of Phase 5b, see "Providers + prompt library" below);
  `needsKey` distinguishes BYO-key providers (anthropic/openai/custom) from
  the local one (ollama); `models()`
  is a curated static list (not a live `/v1/models` fetch — avoids
  a network round-trip + auth just to fill a dropdown); `summarize()` streams
  token deltas via `onToken` and resolves the full accumulated text.
- **Registry** (`packages/core/src/ai/registry.ts`, `AiRegistry`): `register()`
  replaces an existing provider with the same `id` or appends; `get(id)` /
  `list()` are straight lookups. Registered once in `main/index.ts`:
  ```ts
  if (apiKey) aiRegistry.register(createAnthropicProvider({ apiKey }));
  // else: no provider registered until the user sets a key
  ```
- **Anthropic provider** (`apps/desktop/src/main/ai/anthropic-provider.ts`,
  `createAnthropicProvider`, id `ANTHROPIC_ID = "anthropic"`): wraps
  `@anthropic-ai/sdk`'s `client.messages.stream({ model, max_tokens, system,
messages })`, forwards each `stream.on("text", delta => onToken(delta))`
  event, then awaits `stream.finalMessage()` and joins its text content
  blocks into the returned full string. `ANTHROPIC_MODELS` is the curated
  list (`claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5`). The SDK
  surface is narrowed to `AnthropicClientLike`/`AnthropicStreamLike`
  structural interfaces (injectable via `clientFactory`) so the provider is
  unit-testable with a fake stream, never a real network call. no
  `thinking` param, fixed `max_tokens: 4096` (set by the caller) — expose in
  Settings only if users hit a ceiling.
- **Key storage** (`apps/desktop/src/main/secrets.ts`, `createSecrets`):
  encrypted-at-rest BYO API key storage backed by Electron's `safeStorage`
  (`keytar` deliberately swapped for the OS-native, dependency-free
  `safeStorage` — one less native module on the exFAT/Electron-ABI rebuild
  path). `setKey` throws and writes nothing if
  `safeStorage.isEncryptionAvailable()` is false — **never** falls back to
  plaintext. `getKey` treats an undecryptable blob (corruption, OS reinstall,
  DPAPI/Keychain scope change) the same as "no key configured" so startup
  degrades gracefully. `safeStorage` is injected as `SafeStorageLike` so the
  module (and its Vitest suite) load under plain Node without importing
  `electron`; ciphertext lived at `userData/secrets/anthropic.key` in 5a — as
  of 5b each keyed provider gets its own blob (see "Providers + prompt
  library" below).
- **Prompt library** (`packages/db/src/migrations/004-prompt.sql.ts`,
  `packages/db/src/prompt.ts`): a `prompt` table (`name`, `body`,
  `is_builtin`, `created_at`), seeded in the migration with three read-only
  built-ins — "Key points", "Detailed summary", "TL;DR". `listPrompts`/
  `getPromptById` are the only accessors 5a needs; **user-authored
  prompt CRUD (add/edit/delete) is Phase 5b** — 5a's picker only ever shows
  the three seeded rows. Migration 017 (`017-creator-prompts.sql.ts`, later)
  additionally seeds a **creator prompt pack** — seven starter prompts
  (YouTube chapters, title ideas, video description, podcast show notes, blog
  post, newsletter issue, short-form moments) inserted with `is_builtin = 0`
  on purpose, since they're meant to be rewritten and built-ins can't be
  edited or deleted; two of them ("YouTube chapters", "Short-form moments")
  carry the `{{TIMESTAMPS}}` marker (see "Prompt assembly" below).
- **Prompt assembly** (`packages/core/src/ai/prompt.ts`):
  `SUMMARY_SYSTEM_PROMPT` is a fixed system message (summarize spoken-word
  transcripts faithfully, no invented information); `assembleSummaryContent
(promptBody, transcriptText, frames?, segments?)` builds the user message:
  prompt body + `----- TRANSCRIPT -----` + transcript text, plus a
  `----- ON-SCREEN TEXT (SLIDES) -----` section when `frames` (OCR'd
  on-screen text, timestamped) are present — frame extraction itself is the
  slides flow, which this file doesn't cover yet (see `CLAUDE.md`'s "Not in
  DEVELOPMENT.md" note). A prompt body containing the `{{TIMESTAMPS}}`
  marker (`TIMESTAMPS_TOKEN = "{{TIMESTAMPS}}"`) opts into a **timestamped
  transcript**: the marker is stripped from the prompt body, and the
  transcript section renders each `segments` line as `[mm:ss] line` instead
  of the flat joined text (falling back to flat text if there are no usable
  segments). Without the marker, `segments` is ignored and the assembled
  content is unchanged. This is what lets prompts like the seeded "YouTube
  chapters" cite real times instead of inventing them.
- **Storage** (`packages/db/src/migrations/005-summary.sql.ts`,
  `packages/db/src/summary.ts`): a `summary` table (`media_id`, `prompt_id`,
  `provider_id`, `model`, `text`, `created_at`), one row per summarize call;
  `insertSummary`/`getSummaryById` are the accessors the service needs.
  Re-running summarize (different model/prompt, or the same one again) just
  inserts another row — summaries are additive, never overwritten.
- **Service** (`apps/desktop/src/main/services/summarize-service.ts`,
  `SummarizeService.start`): find-or-creates the `media` row for
  `metadata.sourceUrl` (same `download_status: "none"` pattern as
  `TranscriptService` — `fromMetadata`'s camel→snake mapper is now
  duplicated a third time across Download/Transcript/Summarize services;
  fold into a shared `@sift/db` helper in 5b/6, this is the "unify on the
  3rd caller" line), loads the newest transcript (`getTranscriptsByMediaId
(...)[0]`, throws `"Get a transcript first."` if none), resolves the
  provider from the registry (throws `"Unknown AI provider."`) and the
  prompt by id (throws `"Prompt not found."`), assembles the content, calls
  `provider.summarize(...)` forwarding deltas to the caller's `onToken`,
  persists the result via `insertSummary`, and returns the mapped
  `SummaryRecord`. `export(summaryId)` writes `row.text` to
  `<downloadsDir>/<uploader__title>__summary.md` (via `buildOutputBaseName` +
  `sanitizeFilename`, same naming helper as downloads) and returns the
  absolute path; `mkdirSync(downloadsDir, { recursive: true })` first so
  export never depends on a prior download having created the folder.
  the export filename doesn't include the prompt name (spec's
  `{uploader}__{title}__{prompt}.md` convention) and the path isn't
  configurable — both land in Phase 6/8.
- **IPC** (`apps/desktop/src/main/ipc/summarize.ts`, `apps/desktop/src/main/ipc/ai-providers.ts`,
  `packages/ipc-contract`): `summarize:start(input)` calls
  `SummarizeService.start`, streaming each token delta to **every** open
  window over a `summarize:token` push channel as `SummaryToken { requestId,
delta, done }` (`requestId` is caller-supplied so the renderer can ignore
  stale streams from a superseded request — see below), then sends one final
  `{ requestId, delta: "", done: true }` once the record is persisted;
  `summarize:export(summaryId)` proxies `SummarizeService.export`;
  `prompts:list` proxies `listPrompts`. `ai-providers:list` maps the
  registry to `AiProviderInfo[]`; `ai-providers:keyStatus`/`:setKey`/
  `:clearKey` proxy `createSecrets`, and `setKey` also calls a `rebuild`
  callback that re-registers a fresh provider into the live `AiRegistry` so
  summarizing works immediately without an app restart. As of 5b, `clearKey`
  is a true revoke: it clears the stored secret **and** calls
  `AiRegistry.unregister(providerId)`, so a cleared key stops working
  immediately instead of lingering in the registry until the next launch
  (closes the 5a follow-up noted above). Errors (missing transcript, unknown
  provider, missing prompt, provider/network failures) are left to
  propagate — `ipcMain.handle` turns them into a rejected renderer-side
  `invoke()`, same pattern as transcript/download.
- **Renderer** (`apps/desktop/src/renderer/App.tsx`,
  `.../home/preview-card.tsx`, `.../home/summary-panel.tsx`,
  `.../settings/ai-providers-section.tsx`): as of 5b the preview card shows
  three `<select>`s — `data-testid="summary-provider"` (populated from the
  static `KNOWN_PROVIDERS` catalog, see "Providers + prompt library"
  below), `"summary-model"` (that provider's `models()`), and
  `"summary-prompt"` (from `prompts.list()`) — and a
  `data-testid="summarize-button"` disabled until a transcript exists.
  `handleSummarize` bumps a per-`HomeView` `summaryRequestIdRef` counter
  (an incrementing counter, not a UUID — enough to ignore stale
  streams; a real id space isn't needed for one active summary), clears
  prior state, and calls `window.sift.summarize.start({ metadata,
providerId, model, promptId, requestId })` with the user's selected
  provider (5a hardcoded `providerId: "anthropic"`; 5b threads the picker's
  selection through); a
  `window.sift.summarize.onToken` subscription (mounted once) appends
  `delta` to `summaryText` for any non-`done` token matching the current
  request id, giving a live-accumulating stream. `SummaryPanel`
  (`data-testid="summary-panel"`) renders `summary?.text ?? text` in
  `data-testid="summary-content"` — the streamed text while in flight, the
  persisted record's text once `start()` resolves — with a
  `data-testid="summary-export"` button that calls
  `window.sift.summarize.export(summary.id)` and shows the returned path as
  `data-testid="summary-export-path"`. Errors render as
  `data-testid="summary-error"`. Settings → AI providers
  (`data-testid="ai-providers-section"`) has the key input
  (`ai-key-input`/`ai-key-save`/`ai-key-clear`) and status badge
  (`ai-key-status`, "Key saved" / "No key").

### Offline summarize e2e fixture

`apps/desktop/e2e/summarize.spec.ts` exercises the whole pipeline above — URL
→ transcript → Summarize click → streamed tokens → persisted summary row →
export — without a real Anthropic API key or network access, reusing the
same `SIFT_E2E_FIXTURE_DIR` hook as the metadata/download/transcript e2e
specs. One addition in `main/index.ts` makes this offline-safe:
`fixtureAiProvider()` — registered instead of `createAnthropicProvider` when
`SIFT_E2E_FIXTURE_DIR` is set — is an `AiProvider` with id `"anthropic"`,
`needsKey: false`, a single `models()` entry (`fixture-model` / "Fixture"),
and a `summarize` that streams two canned deltas (`"Fixture summary "`,
`"line one."`) via `onToken` then resolves the full canned
`FIXTURE_SUMMARY = "Fixture summary line one.\nFixture summary line two."`
— no SDK call, no network. Because the fixture stub resolves synchronously,
the spec asserts the terminal `summary-panel`/`summary-content` state
(containing "Fixture summary") rather than any mid-flight streaming frame,
same reasoning as `download.spec.ts`'s `download-done` and
`transcript.spec.ts`'s `transcript-panel` assertions. The spec also clicks
`summary-export` and asserts `summary-export-path` appears — `downloadsDir`
is pointed at the same `<temp>/sift-e2e-downloads` fixture directory used by
download/transcript, so the `.md` write succeeds offline without touching a
real user's Downloads folder.

**Real-summary human-test caveat:** the offline e2e proves the UI/IPC/DB/
streaming pipeline end-to-end, but it never calls the real Anthropic API, so
it cannot verify actual model output quality or the real `safeStorage`
encryption round-trip on this machine. Getting a **real** summary requires a
human pass: open Settings → AI providers, paste a real Anthropic API key
into `ai-key-input` and Save (confirm the badge flips to "Key saved"), then
on Home load a captioned public video, click "Get transcript", pick a
model/prompt, click "Summarize", and confirm (a) tokens visibly stream in
rather than appearing all at once, (b) the summary text reads well and
matches the chosen prompt style, and (c) "Export" writes a readable `.md`
file to the Downloads folder. This is tracked as a Phase 5a follow-up
(human-test only), not a gap in the automated suite — the provider/
streaming/storage/export logic itself is fully unit- and e2e-tested against
fakes.

**Delivered in Phase 5b** (see "Providers + prompt library" below): OpenAI,
Ollama, and custom (OpenAI-compatible base_url) providers registered
alongside Anthropic in the same `AiRegistry`; user prompt-library CRUD
(add/edit/delete on top of the three seeded built-ins); per-provider
`safeStorage` keys; `AiRegistry.unregister` so `clearKey` truly revokes.
**Whisper transcripts:** summarize works against any transcript regardless of
which provider produced it, so summarizing a Whisper-transcribed caption-less
video needs no changes here.

## Providers + prompt library (Phase 5b)

Phase 5b registers three more `AiProvider`s alongside Anthropic (5a) in the
same `AiRegistry`, and adds user prompt CRUD on top of the three seeded
built-ins. Real network round-trips for OpenAI/Ollama/custom are
**human-test-only** — the e2e suite only ever exercises the offline fixture
providers (see "Offline e2e fixture hook" below).

- **OpenAI provider** (`apps/desktop/src/main/ai/openai-provider.ts`,
  `createOpenAiProvider`, id `OPENAI_ID = "openai"`): wraps the `openai` npm
  SDK's `client.chat.completions.create({ model, max_tokens, stream: true,
messages: [{ role: "system", ... }, { role: "user", ... }] })` — the
  widely-compatible `chat.completions` streaming surface (not the newer
  Responses API), chosen specifically because every OpenAI-compatible
  endpoint (custom base_url, many local servers) implements it, so the
  custom provider (below) can reuse the exact same code. Iterates the
  returned `AsyncIterable` of chunks, forwarding each
  `chunk.choices[0].delta.content` to `onToken` and accumulating the full
  string. `OPENAI_MODELS` is the curated static list (`gpt-4o`, `gpt-4o
mini`, `gpt-4-turbo`). The SDK surface is narrowed to a minimal
  `OpenAiClientLike` structural interface (injectable via `clientFactory`)
  so the provider is unit-testable with a fake async-iterable, never a real
  network call.
- **Ollama provider** (`apps/desktop/src/main/ai/ollama-provider.ts`,
  `createOllamaProvider`, id `OLLAMA_ID = "ollama"`): local + **keyless**
  (`needsKey: false`) — always registered at startup (unlike the keyed
  providers, which wait for a stored secret), pointed at
  `DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"` unless overridden.
  `summarize()` POSTs to `${baseUrl}/api/chat` with `stream: true` and
  hand-parses the response body's raw byte stream as **NDJSON** (one JSON
  object per line, `{ message: { content }, done }`) via `parseOllamaChunks`
  — no `ollama` SDK dependency for one endpoint. The reader loop buffers
  partial lines across `reader.read()` calls (only complete,
  newline-terminated lines are parsed; a trailing partial line is carried
  into the next read) and stops as soon as a chunk with `done: true` is
  seen, flushing any final unterminated line first. A failed `fetch` (or a
  non-OK/bodyless response) is normalized to `Could not reach Ollama at
${baseUrl}. Is it running?` — the daemon-not-running case a local user
  hits constantly. `OLLAMA_MODELS` is a small static fallback (`llama3.1`,
  `mistral`); a live `/api/tags` fetch to list whatever the daemon actually
  has pulled is a later nicety, not implemented.
- **Custom provider**: not a separate implementation — it's
  `createOpenAiProvider({ apiKey, baseURL: cfg.baseUrl, id: "custom", label:
"Custom (OpenAI-compatible)", models: [{ id: cfg.model, label: cfg.model
}] })`, i.e. the OpenAI provider pointed at a user-supplied base_url with a
  single free-text model. "Custom (OpenAI-compatible)" means exactly that:
  no separate SDK, no model discovery, just the same `chat.completions`
  streaming call against a different host. Supports **one** endpoint/model;
  multiple named custom endpoints is a later nicety.
  - **Custom config store** (`apps/desktop/src/main/ai/custom-config.ts`,
    `createCustomConfigStore`, `CustomProviderConfig { baseUrl, model }`):
    the base_url/model pair is **not secret**, so it's a plain JSON file
    (`userData/secrets/custom-config.json`, co-located with `secrets/` for
    convenience but not `safeStorage`-encrypted) separate from the API key,
    which still goes through `secretsFor("custom")` like any other provider.
    `set()` strips any fields beyond `{ baseUrl, model }` before writing.
    `get()` returns `null` (never throws) if the file is missing or contains
    malformed JSON — treated the same as "not configured yet".
- **Per-provider key storage**: 5a's single `userData/secrets/anthropic.key`
  became, in 5b, one encrypted blob per **keyed** provider —
  `secretsFile(providerId)` → `userData/secrets/<providerId>.key` — resolved
  on demand and memoized in `main/index.ts`'s `secretsById` map so repeated
  IPC calls for the same provider reuse the same `createSecrets` instance
  instead of re-touching the filesystem seam every call. Ollama has no
  secrets file at all (keyless).
- **`AiRegistry.unregister(id)`** (`packages/core/src/ai/registry.ts`):
  removes a provider by id (no-op if never registered). `ai-providers:
clearKey` now calls both `secretsFor(providerId).clearKey()` **and**
  `registry.unregister(providerId)` — a true revoke, so a cleared key stops
  working immediately instead of lingering in the live registry until the
  next app launch (this closes the 5a follow-up noted in the Summarize flow
  section above).
- **Real (non-fixture) registration** (`apps/desktop/src/main/index.ts`):
  keyed providers (anthropic, openai, custom) register only if a stored key
  is found at startup; Ollama registers unconditionally (keyless, local).
  `rebuild(providerId, key)` — called from `ai-providers:setKey` and from
  `ai-providers:customConfigSet` when a key is already on file — builds and
  re-registers a fresh provider for anthropic/openai/custom so a newly-saved
  key (or a changed custom base_url/model) takes effect without an app
  restart; Ollama isn't part of this flow since it never goes through the
  key-set IPC path.
- **Prompt CRUD** (`packages/db/src/prompt.ts`,
  `apps/desktop/src/main/ipc/summarize.ts` — the `prompts:create`/`:update`/
  `:delete` channels are registered alongside `summarize:start` in the same
  file as `prompts:list` — `apps/desktop/src/renderer/routes/settings/
prompts-section.tsx`): built-ins (`is_builtin = 1`, the three seeded rows)
  are **read-only** — the UI renders a "Built-in" badge and no Edit/Delete
  controls for them (`prompts-section.tsx` only renders the edit/delete
  button group `{!p.isBuiltin && (...)}`). User prompts get full CRUD:
  `prompt-name-input`/`prompt-body-input`/`prompt-add` create a row;
  `prompt-edit-{id}` opens inline `prompt-edit-name-{id}`/
  `prompt-edit-body-{id}` fields with `prompt-edit-save-{id}`/
  `prompt-edit-cancel-{id}`; `prompt-delete-{id}` removes it. **Delete is
  BLOCKED** (throws, surfaced as `data-testid="prompt-error"`) when any
  `summary` row references the prompt (`prompt_id` FK lookup) — no
  soft-delete/reassign, least-surprising for MVP; a prompt referenced by a
  past summary can't silently disappear out from under that summary's
  provenance. `PromptInfo` (the IPC/renderer type) now carries `body` (not
  just `id`/`name`/`isBuiltin`) specifically so `startEdit(p)` can pre-fill
  the edit form with the current body instead of an empty textarea. Both the
  Add-prompt and edit-prompt body textareas carry a short helper line
  mentioning the `{{TIMESTAMPS}}` marker, so a user editing the seeded
  "YouTube chapters" prompt (or writing their own) doesn't delete it without
  knowing what it does.
- **Prompt pack import/export** (`prompts:export`/`prompts:import`,
  `apps/desktop/src/main/ipc/summarize.ts`, `apps/desktop/src/main/ipc/
prompt-pack.ts`, `packages/db/src/prompt.ts`'s `upsertPromptByName`):
  `prompts:export` (`data-testid="prompts-export"`) writes every non-builtin
  prompt (`{ name, body }[]`) to a user-chosen `.json` file via a native save
  dialog (parented to the focused window, defaulting to
  `<branding.slug>-prompts.json`), returning `null` if the user cancels.
  `prompts:import` (`data-testid="prompts-import"`) opens a native open
  dialog (also parented) and hands the file contents to `parsePromptPack`
  (`prompt-pack.ts` — Electron- and db-free by design, unit-tested on its
  own), which validates each entry's `name`/`body` and drops malformed ones
  without failing the whole import (`skipped` count). Every valid entry is
  then upserted **by name** via `upsertPromptByName`: a new name creates a
  prompt, a name matching an existing user prompt replaces its body in
  place (this is what makes a pack re-importable after edits), and a name
  matching a built-in throws rather than shadowing it. `upsertPromptByName`
  reports whether each entry was created or replaced an existing same-named
  row, folded into `PromptImportResult { imported, skipped, created,
replaced }`; the renderer's `data-testid="prompts-notice"` banner
  (`prompts-section.tsx`) surfaces that split — e.g. "Imported 7 — 5
  replaced existing prompts of the same name." — so importing a pack over
  hand-edited prompts (the seeded creator pack's own names are the obvious
  collision case) is never a silent, unannounced overwrite. If a pack import
  fails partway (e.g. a later entry's name collides with a built-in), the
  entries upserted before the failure are left in place — safe to retry
  after fixing the pack, since re-running import doesn't duplicate what
  already landed.
- **Home provider/model/prompt picker**
  (`apps/desktop/src/renderer/lib/ai-provider-catalog.ts`,
  `.../home/preview-card.tsx`): `KNOWN_PROVIDERS` is a **static** mirror of
  the four built-in providers' id/label/needsKey/models — deliberately
  independent of `aiProviders.list()` (which only reports providers already
  registered in the main-process registry, i.e. already keyed) so the
  picker can show and let the user key a provider that isn't registered
  yet, avoiding a chicken-and-egg. `App.tsx`'s `loadProviders()` effect
  overlays live state on top: it swaps in the real `[{ id: cfg.model, label:
cfg.model }]` for `custom` once `getCustomConfig()` resolves, and computes
  `defaultProviderId` as the **first** `KNOWN_PROVIDERS` entry whose key
  check passes (`keyStatus(id)` for keyed providers, `Promise.resolve(true)`
  for Ollama since it's keyless) — so an unkeyed fresh install with no
  Anthropic/OpenAI/custom key defaults to Ollama. `PreviewCard` renders
  three selects: `data-testid="summary-provider"` (all of `KNOWN_PROVIDERS`,
  by label), `"summary-model"` (the selected provider's `models()`), and
  `"summary-prompt"` (from `prompts.list()`).

### Offline provider-picker + prompt-CRUD e2e

`apps/desktop/e2e/providers-prompts.spec.ts` covers two things offline, under
the same `SIFT_E2E_FIXTURE_DIR` hook as the other e2e specs:

1. **Provider picker**: load a URL, wait for `preview-card`, then assert
   `summary-provider` lists multiple providers (it reads the `<option>`
   values and asserts `"ollama"` plus at least one more are present, with no
   duplicates). Since the picker is driven by the static `KNOWN_PROVIDERS`
   catalog, all four options render regardless of which providers are
   registered in the main-process `AiRegistry` — the spec does **not** run a
   real summary through OpenAI/Ollama (no network in e2e), it only asserts
   the picker lists them.
2. **Prompt CRUD round-trip**: navigate to Settings
   (`getByRole("button", { name: "Settings" })`, same pattern as
   `binaries.spec.ts`/`metadata.spec.ts`), wait for `prompts-section`, fill
   `prompt-name-input`/`prompt-body-input`, click `prompt-add`, assert the
   new prompt's card (`[data-testid^="prompt-item-"]` filtered by its name)
   appears, click its `Delete` button, and assert the card is gone. Built-in
   prompts are never touched — only the just-created user prompt has a
   Delete control.

**Human-test caveats (cannot be covered offline):** real OpenAI (Settings →
add an OpenAI key → Home → Summarize with OpenAI selected, confirm streamed
tokens and real model output); real Ollama (install/run the Ollama daemon
locally, `ollama pull llama3.1` or another model, then Summarize with Ollama
selected and **no** key configured — confirm it works keyless against
`localhost:11434` and that stopping the daemon produces the "Could not reach
Ollama" error); real custom endpoint (Settings → set base_url + model +
key for a reachable OpenAI-compatible server, confirm Summarize streams and
resolves against that endpoint). Each provider's streaming/parse logic is
unit-tested against fakes (`openai-provider.test.ts`,
`ollama-provider.test.ts`, `custom-config.test.ts`); only the real network
round-trips need a human pass, same posture as 5a's real-Anthropic caveat.

## Library depth (Phase 6a + Phase 6 Redesign Part B)

Beyond the table/grid list (see "Renderer — Library" above), each row/card
has a Details affordance and a two-step Remove
(`apps/desktop/src/renderer/routes/library/`):

- **Details** (`data-testid="media-open"`) opens `MediaDetailPage`
  (`media-detail.tsx`, `data-testid="media-detail"`, title
  `media-detail-title`), which loads a single media row's downloads,
  transcripts, and summaries via `library:detail` (`MediaDetail { media,
downloads, transcripts, summaries }`). `media-detail-back` returns to the
  library list (whichever view — table or tiles — was active).
- **Downloads section** (Part B): one `Card` per `DownloadRecord`
  (`data-testid="media-detail-download"`, header `"<format label> ·
<status>"`) with, depending on status: `media-detail-download-reveal`
  ("Show in folder", only when `status === "done"` and a `filePath` exists),
  `media-detail-download-retry` (only when `status === "error"` — re-fetches
  metadata, resolves the same `formatId`'s option, and re-runs the download
  in place), and `media-detail-download-remove` (always present — calls
  `library:removeDownload`, which deletes that one download row/file and
  reloads the detail view; deliberately **per-capture**, not a media-wide
  remove, so a user can drop the 1080p file but keep the audio-only one).
  Errored downloads also render `d.error` inline. In-flight downloads (from a
  Retry) show a progress bar (`media-detail-download-progress`), fed by the
  same `download:progress` push channel filtered to `p.mediaId === id`. Empty
  state: "No downloads yet." (There is **no** add-a-new-format control here —
  new captures are started from the Home preview card; the detail view only
  manages existing captures.)
- **Transcripts section**: one card per transcript (`media-detail-transcript`,
  with `media-detail-transcript-remove` → `library:removeTranscript`) plus a
  **Get transcript** button (`media-detail-get-transcript`) in the section
  header that fetches metadata (`metadata:fetch(media.sourceUrl)`, cached in a
  ref) then `transcript:get` and reloads — for pulling a transcript that's
  missing (or re-fetching). Empty state: "No transcripts yet."
- **Summaries section**: one card per summary (`media-detail-summary`, with
  `media-detail-summary-export` reusing `summarize:export` and
  `media-detail-summary-remove` → `library:removeSummary`), plus an in-detail
  **Run prompt** control — provider/model/prompt `<select>`s
  (`media-detail-summary-{provider,model,prompt}`) + `media-detail-summarize`
  button, disabled until a transcript exists. It fetches metadata then
  `summarize:start` and reloads to show the new card (no live token streaming
  in the detail view — the card appears on completion). The picker state comes
  from the shared `useAiPickers()` hook (renderer `lib/use-ai-pickers.ts`),
  which loads the configurable providers + user prompts and holds the
  selection; the Home `PreviewCard` has parallel inline logic. Action errors
  (transcript or summary) surface once via `media-detail-action-error`; a
  `media-detail-no-provider` hint shows when a transcript exists but no
  provider key is set.
- **Remove** is a **two-step confirm** at all three entry points — each
  button toggles to a "Confirm remove"/"Cancel" pair in place rather than a
  modal — and calls `library:remove`, which deletes the whole `media` row and
  cascades its `download`/`transcript`/`summary` rows (and their on-disk
  files): the table row and the tile card (`data-testid="media-remove"` →
  `media-remove-confirm`/"Cancel") and the detail header
  (`data-testid="media-detail-remove"` → `media-detail-remove-confirm`/
  "Cancel", own `confirmingRemove` state in `MediaDetailPage`). Removing is
  **permanent — there is no undo**, whether done at the media level or
  per-download/transcript/summary, so use it deliberately. (The per-download
  `media-detail-download-remove` above is intentionally a **one-click**
  delete — no confirm step — since it only removes that single capture, not
  the whole media row.)

### Home "already captured" notice (Part B, Task 5)

`HomeView` (`apps/desktop/src/renderer/App.tsx`) looks up `library:list` right
after a metadata fetch resolves and matches on `media.sourceUrl`, storing the
result as `existingItem`. `PreviewCard`
(`apps/desktop/src/renderer/routes/home/preview-card.tsx`) renders
`data-testid="already-captured"` ("Already in your library — `<format
labels>`") whenever that item has any `done` downloads, and swaps the
Download button's label to `"Re-download <format label>"` when the
currently-selected format preset already has a matching `done` download —
so re-downloading the same format is an explicit, informed choice rather
than a silent duplicate. The lookup is non-blocking: a failed `library:list`
call is swallowed (caught, ignored) so it never blocks or breaks the preview
card itself.

### Offline library-depth e2e fixture

`apps/desktop/e2e/library-depth.spec.ts` covers the whole path offline (same
`SIFT_E2E_FIXTURE_DIR` fixture as the other specs): download → Library
(`library-table` visible, a `library-row` present) → Details
(`media-detail`/`media-detail-title`) → assert the fixture download appears
as one `media-detail-download` → `media-detail-download-remove` → assert it's
gone (`media-detail-download` count 0, "No downloads yet." visible) →
`media-detail-back` → exercise the Tiles/Table toggle
(`library-view-tiles` → `library-grid` visible, `library-view-table` →
`library-table` visible again) → `media-remove` → `media-remove-confirm` →
`library-empty`. `apps/desktop/e2e/download.spec.ts`'s post-download Library
assertion was updated in lockstep for the table-first default: it now checks
`library-table` visible and a `library-row` containing "Fixture Video Title"
instead of the old `library-grid`/`media-card` assertions.

## Offline e2e fixture hook (`SIFT_E2E_FIXTURE_DIR`)

`apps/desktop/e2e/binaries.spec.ts` exercises the real install flow (UI → IPC →
`BinariesService` → download/verify → DB → UI update) without touching the
network or a real install. Set `SIFT_E2E_FIXTURE_DIR` to a directory containing a
file named `yt-dlp` before launching the built app, and `main/index.ts`
(`apps/desktop/src/main/index.ts`) will:

1. Point `app.getPath("userData")` at a fresh temp directory for that process, so
   the test gets its own isolated `asset` DB and `binaries/` install dir instead
   of a real user's.
2. Construct `BinariesService` with a fixture `BinarySource` for `ytdlp` whose
   `resolveLatest()` returns a fixed `{ version: "9.9.9", assetUrl:
"fixture://yt-dlp", sha256: <sha256 of the fixture file>, binaryName: "yt-dlp"
}` (`ffmpeg`'s fixture source throws — the e2e doesn't exercise it).
3. Inject a fixture `fetchImpl` that resolves `fixture://<name>` URLs by reading
   `<SIFT_E2E_FIXTURE_DIR>/<name>` off disk and wrapping it in a `Response`, since
   Node's global `fetch` has no `file://`/custom-scheme support.
4. Build the `MetadataService` with an in-memory stub `YtDlpRunner`
   (`fixtureYtDlpRunner()` in `index.ts`) instead of `createYtDlpRunner(...)` —
   its `dumpJson()` returns a canned `-J` object (title "Fixture Video Title",
   `extractor_key: "Youtube"`, `automatic_captions: { en: [{}] }`, so it
   normalizes to a "tested"/"YouTube"/`hasCaptions: true` preview) for _any_
   URL, and `listExtractors()` returns a fixed short list. Exercised by
   `apps/desktop/e2e/metadata.spec.ts`, which never shells out to a real
   yt-dlp binary or touches the network. The same stub's `download()` returns
   two canned progress ticks plus a fixed `filePath` under
   `<temp>/sift-e2e-downloads` (see "Offline download e2e fixture" above),
   exercised by `apps/desktop/e2e/download.spec.ts`. `DownloadService` is also
   pointed at `<temp>/sift-e2e-downloads` instead of the real `downloadsDir()`
   whenever this branch is active. The same stub's `fetchSubtitles()` writes a
   canned two-cue VTT into the given `outputDir` and returns its path (see
   "Offline transcript e2e fixture" above), exercised by
   `apps/desktop/e2e/transcript.spec.ts`. In the same branch, `AiRegistry`
   registers a small **keyless fixture set** — `fixtureAiProvider("anthropic",
"Fixture AI")` and `fixtureAiProvider("ollama", "Fixture Ollama")` — instead
   of the real keyed providers, and `SummarizeService` is pointed at the same
   `<temp>/sift-e2e-downloads` directory (see "Offline summarize e2e
   fixture" above), exercised by `apps/desktop/e2e/summarize.spec.ts` and
   `apps/desktop/e2e/providers-prompts.spec.ts` (see "Providers + prompt
   library" below). The Ollama fixture never dials a real daemon — it's the
   same canned in-memory stub as the Anthropic fixture, just a second
   registry id/label; both providers are `needsKey: false` so they're always
   "ready" without a stored secret, which is why Ollama ends up as the
   e2e-only default-selected provider (see the renderer's
   `defaultProviderId` resolution below).

This env var must never be set for real usage — only the e2e specs set it. The
non-fixture (production) construction path (real `createYtDlpRunner`,
`SOURCES`, and the real `createAnthropicProvider`/`createOpenAiProvider`/
`createOllamaProvider` providers) is unchanged.

## Sign-in browser / cookie auth

Some platforms (YouTube first) throttle or bot-check yt-dlp when it has no
session cookies, so instead of a per-platform Accounts registry, Sift gives
the user a single **generic sign-in browser**: one app-owned window they can
point at any site — YouTube, Vimeo, whatever needs a login — rather than
asking anyone to hand-export a `cookies.txt`. `openSignInBrowser()`
(`apps/desktop/src/main/auth/sign-in-browser.ts`) opens a `BrowserWindow`
with an inline address bar driving a single `<webview>`
(`webviewTag: true` is enabled _only_ on this window, never on the main
app window) scoped to one shared `persist:auth` partition; the user types in
whatever URL they want and logs in normally, and the returned promise
resolves once they close the window. `createAuthManager`
(`apps/desktop/src/main/auth/auth-manager.ts`) is the Electron-free brain
sitting on top of that partition: `listSites()` reads every cookie
currently in `persist:auth` and groups them by `registrableDomain`
(`auth/status.ts`, a naive eTLD+1-by-last-two-labels heuristic, display-only)
into `SignedInSite { domain, expired }` rows; `removeSite(domain)` clears
cookies for that exact registrable domain. Crucially there's no per-platform
allowlist or login-URL registry any more — any domain the user signs into
shows up. Cookies never leave the manager as raw session data:
`cookiesFileForUrl(url)` ignores the URL's host and always serializes the
**whole jar** (every cookie in `persist:auth`, any site) to one Netscape-format
`cookies.txt` via `toNetscapeCookies` (`auth/netscape.ts`), returning `null`
only when the jar is completely empty. `MetadataService`, `DownloadService`,
and `TranscriptService` each accept a `getCookiesFile`/`reportAuthFailure`
pair and pass the resolved path to yt-dlp's `--cookies` flag on every call;
if yt-dlp still fails with a bot-check-style error (`isAuthError`,
`auth/status.ts`), the service calls `reportAuthFailure(url)`, which flags
that URL's registrable domain so the next `listSites()` call reports it
`expired: true` ("may be signed out — reopen to sign in") without anything
actually deleting the cookies. The manager's own seams
(`readAllCookies`/`removeCookiesForDomain`/`openBrowser`/`cookiesPath`/
`writeFile`/`removeFile`) are injected and wired to real `session`/
`openSignInBrowser`/`fs` calls once in `main/index.ts`, so the Vitest suite
exercises the manager without Electron.

## Batch queue (Phase 7)

Phase 7 adds a `Queue` page for bulk processing many URLs unattended, on top of
the same per-video services (download/transcript/summarize) used by Home:

- **Storage** (`packages/db/src/migrations/007-queue.sql.ts`,
  `packages/db/src/queue.ts`): additive migration (`schema_migrations` → 7)
  adding a `queue_item` table (`source_url`, `spec_json`, `status`,
  `ops_json`, `media_id`, `queue_order`, `error`, `created_at`).
  `insertQueueItem`/`updateQueueItem`/`deleteQueueItem`/`listQueueItems`
  (ordered by `queue_order`)/`getQueueItem`/`maxQueueOrder`/`setQueueOrder`/
  `resetRunningToQueued` are the only accessors the worker needs;
  `updateQueueItem` takes a sparse patch and only touches columns present in
  it (nulling `media_id`/`error` requires passing them explicitly).
- **Worker** (`apps/desktop/src/main/services/queue-worker.ts`,
  `QueueWorker`): drains the queue **sequentially, one item at a time**
  (`tick()` re-enters itself after each item, guarded by a `processing`
  flag) — no concurrency knob, matching the design's "one active item"
  decision. Each item runs its ops (download → transcript → summarize) in
  order against the same injected `DownloadService`/`TranscriptService`/
  `SummarizeService` instances the rest of the app uses, so a queued item is
  processed identically to a manual Home click. The per-video download
  format is resolved **per item** from the queue spec's format preference
  via `resolveQueueFormat(computeDownloadOptions(meta.raw), spec.format)`
  (`queue-format.ts`) against that item's freshly-fetched metadata, not a
  single format picked at add-time. Each op's outcome is tracked
  independently in `ops_json` (`pending | running | done | error |
skipped`) — a failed download doesn't block transcript/summarize from
  still being attempted, and the item still reaches the terminal `done`
  status with per-op errors visible (**partial success**, not all-or-nothing).
  `retry(id)` resets only the `error` ops back to `pending` and re-runs the
  item, so a partially-failed item can be fixed up without redoing work that
  already succeeded. Cancel is **cooperative**: `cancel(id)` on a running
  item just flags its id in a `Set`, checked between op boundaries — the
  in-flight yt-dlp call is never hard-killed, it's left to finish and the
  item is marked `canceled` once the current op boundary is reached.
  `recover()` (called once at startup) resets any item stuck `running` from
  a crash back to `queued` and normalizes its in-flight op back to `pending`
  so the interrupted work actually re-runs rather than being silently
  skipped. Every mutation calls `emit()`, which pushes the full current
  `QueueItem[]` list to the renderer over a push channel (`queue:update`) —
  a single-window broadcast, matching the `download:progress`/
  `summarize:token` pattern used elsewhere.
- **IPC + renderer** (`apps/desktop/src/main/ipc/queue.ts`,
  `apps/desktop/src/renderer/routes/queue/queue-page.tsx`):
  `window.sift.queue.{add,list,remove,cancel,retry,reorder,pause,resume,
onUpdate}` mirror the worker's public methods 1:1. `QueuePage`
  (`data-testid="queue-page"`) has a multi-line URL textarea
  (`queue-urls`), format/op checkboxes, a `queue-add` button, and a
  `queue-pause`/Resume toggle. One `data-testid="queue-item"` row per queued
  item shows a status line (`data-testid="queue-item-status"`, e.g. `"done
· 1 issue"` when some ops errored) plus up/down reorder, cancel (while
  queued/running), retry (once done with an error), and `queue-item-remove`
  buttons.
- **Offline e2e** (`apps/desktop/e2e/queue.spec.ts`): reuses the same
  `SIFT_E2E_FIXTURE_DIR` hook as the other specs — no new fixture code was
  needed since the worker calls the same injected fixture yt-dlp/AI
  services. One spec adds a URL with download+transcript checked and
  asserts the item's status reaches `/done/` (generous 15s timeout, since
  the queue drains asynchronously) and that the resulting video shows up in
  the Library table; the other pauses the queue first (so nothing drains
  mid-test), adds two URLs, and exercises remove.

All of this is exposed to the renderer as `auth:openBrowser`/`auth:listSites`/
`auth:removeSite` IPC (`ipc/auth.ts`) and `window.sift.auth.{openBrowser,
listSites, removeSite}` (`packages/ipc-contract`, `SignedInSite { domain,
expired }`). The Settings → Sign-in browser section
(`apps/desktop/src/renderer/routes/settings/signin-section.tsx`,
`data-testid="signin-section"`) has an `signin-open-browser` button that
calls `openBrowser()` and refreshes the list once the window closes, a manual
`signin-refresh` button, and one `signin-site-row` per signed-in domain with
a `signin-site-remove` button — no more per-platform sign-in/sign-out toggle,
just "sites with a session" and a way to drop one. `index.ts` makes the auth
manager's Electron seams fixture-aware the same way the rest of the file's
`SIFT_E2E_FIXTURE_DIR` branch does: when the fixture dir is set,
`readAllCookies`/`removeCookiesForDomain`/`openBrowser`/`cookiesPath`/
`writeFile`/`removeFile` are all swapped for fakes backed by an in-memory
`e2eJar` array (pre-seeded with a `youtube.com` cookie) instead of touching a
real `session`, window, or the filesystem, so
`apps/desktop/e2e/signin.spec.ts` can see the seeded row, click Remove, and
confirm it disappears without ever opening a real browser window or hitting
YouTube. This replaces the earlier per-platform `AUTH_TARGETS` registry,
`deriveAuthStatus`/`matchAuthTarget`, and the Accounts UI/e2e entirely.

## Channel tools

Channel tools (sub-project A) let a user track a YouTube channel and pull a
batch of its videos straight into the Queue, on top of the same
`flatPlaylist`/`ChannelService`/queue machinery rather than a new pipeline:

- **Storage** (`packages/db/src/migrations/008-channel.sql.ts`,
  `packages/db/src/channel.ts`): additive migration (`schema_migrations` → 8)
  adding a `channel` table **keyed by `channel_id`** (yt-dlp's stable channel
  id, `UNIQUE`) — not the local autoincrement `id` — so re-adding the same
  channel URL always resolves to the same row instead of creating a
  duplicate. Columns: `url`, `handle`, `title`, `description`, `uploader`,
  `avatar_url`, `banner_url`, `follower_count`, `video_count`,
  `last_seen_video_id`, `new_count`, `last_checked`, `created_at`.
  `insertChannel`/`getChannelById`/`getChannelByChannelId`/`listChannels`
  (newest first)/`updateChannelRefresh`/`deleteChannel` are the plain
  accessors; `upsertChannel` is the identity-preserving entry point — it
  looks up by `channel_id` first and `UPDATE`s in place on a hit, `INSERT`s
  only on a miss.
- **Normalizers** (`packages/core/src/channel/normalize.ts`, pure,
  dependency-free): `normalizeChannel(raw)` maps a loosely-typed yt-dlp
  `--flat-playlist -J` dump into `NormalizedChannel` — every field coerced or
  `null`, throwing only if neither `channel_id` nor `id` is present ("is this
  a channel/playlist URL?"). `avatarUrl`/`bannerUrl` are picked out of the
  `thumbnails` array by shape, not by name: `pickAvatar` takes the largest
  near-square (`width/height` within 0.2 of 1) thumbnail, `pickBanner` takes
  the widest thumbnail whose `id` matches `/banner/i` or whose aspect ratio is
  ≥3:1 — defensive against yt-dlp shapes that omit thumbnails entirely (both
  return `null`). `normalizeChannelEntries(raw, contentType)` maps `entries`
  to `NormalizedChannelVideo[]`, dropping any entry with no `id`.
  `isShort(url, durationSec, contentType)` is short-by-tab first (`shorts`
  content type is always short), then short-by-URL (`/shorts/` in the path),
  then short-by-duration (`<= 60` seconds) — a **best-effort** heuristic since
  yt-dlp's flat-playlist dump doesn't reliably flag shorts on the `videos`
  tab. `countNewSince(entries, lastSeenVideoId, pageSize)` finds
  `lastSeenVideoId` in the newest-first page and returns its index (new-video
  count); if it's off the front of the page entirely, returns `pageSize` as a
  floor rather than under-counting; returns `0` if there's no prior
  `lastSeenVideoId` (first-ever check for a channel isn't "all new").
- **Runner** (`apps/desktop/src/main/sidecars/ytdlp.ts`,
  `createYtDlpRunner().flatPlaylist(url, { items? }, cookiesFile?)`): runs
  `yt-dlp --flat-playlist -J --no-warnings [--playlist-items <items>] --
<url>` (same `--` arg-safety sentinel as `download`/`fetchSubtitles` — the
  channel URL is never interpolated into a shell string) and `JSON.parse`s
  stdout. `items` is a yt-dlp playlist-items slice expression (`"1:1"` for
  add-time identity, `"1:<N>"` for latest-N, `"-<N>:"` for oldest-N) —
  `ChannelService` is the only caller that constructs these strings.
- **Service** (`apps/desktop/src/main/services/channel-service.ts`,
  `ChannelService`): `add(url)` calls `flatPlaylist(url, { items: "1:1" })` —
  just enough to identify the channel and its newest video — normalizes it,
  and `upsertChannel`s (so adding a URL for a channel you already track
  updates its metadata in place instead of duplicating the row). `refresh(id)`
  pages the newest 30 videos tab (`REFRESH_PAGE = 30`), diffs against
  `last_seen_video_id` via `countNewSince`, and persists the new count +
  newest id + `last_checked`; `refreshAll()` runs that over every tracked
  channel sequentially. `listVideos(id, { contentType, order, count })` is
  the Get-videos path: `order: "latest"` fetches `1:<count>`; `"oldest"`
  fetches `-<count>:` (yt-dlp's negative-index slice, i.e. the true tail of
  the playlist) and reverses it so the **oldest video is still first** in the
  returned list; `"most_viewed"` over-fetches a pool
  (`max(count, POOL_CAP=200)`), and only sorts by `view_count` if at least one
  entry in the pool actually has one — channels/extractors that never report
  view counts on flat-playlist dumps fall back to `order: "latest"` with
  `viewCountsAvailable: false` rather than silently returning an
  unsorted/misleading list; the renderer surfaces that flag as the
  "View counts unavailable" note. `contentType` (`"videos" | "shorts" | "live"`)
  resolves to a URL via `tabUrl()`, which appends/replaces the
  `/videos`/`/shorts`/`/streams` path segment. `channelUrlForMedia(mediaId)`
  (used by the Library deep-link, see below) prefers a `channel_url`/
  `uploader_url` field off the media's stored raw metadata JSON, falling back
  to the `media` row's own `uploader_url` column, and **throws** ("This video
  has no channel link.") if neither is present — surfaced as a no-op click in
  the renderer rather than navigating to a broken page. `openForMedia(mediaId)`
  is just `add(await channelUrlForMedia(mediaId))`, so opening a channel from
  the Library goes through the same identity-preserving `upsertChannel` path
  as adding one manually.
- **IPC** (`apps/desktop/src/main/ipc/channels.ts`, `packages/ipc-contract`):
  `channel:add`/`:list`/`:remove`/`:refresh`/`:refreshAll`/`:listVideos`/
  `:openForMedia` map 1:1 onto the service's public methods; errors propagate
  as rejected `invoke()`s like the rest of the app.
- **Renderer** (`apps/desktop/src/renderer/routes/channels/`): `ChannelsPage`
  (`data-testid="channels-page"`) has an add-url input (`channels-add-url`) +
  button (`channels-add`), a `channels-refresh-all` button, and one
  `channel-row` per tracked channel (avatar, title, handle, video/subscriber
  counts, a `channel-new-badge` when `newCount > 0`, per-row Refresh +
  `channel-remove`); clicking a row opens `ChannelDetail`
  (`data-testid="channel-detail"`) instead of navigating a router — `openId`
  is just local state on `ChannelsPage`. `ChannelDetail` has the
  videos/shorts tab toggle (`channel-content-videos`/`channel-content-shorts`),
  order (`channel-order`) and count (`channel-count`) selects, a
  `channel-get-videos` button, one `channel-video` row per result
  (`channel-video-checkbox`, title, `Short` badge, duration, view count), and
  a `channel-select-all` button. Once videos are loaded, it renders the same
  **`QueueSpecControls`** component the Queue page uses
  (`apps/desktop/src/renderer/components/queue-spec-controls.tsx`, extracted
  from `QueuePage` in this phase so the format/maxres/transcript/summarize
  controls aren't duplicated) to build a `QueueSpec`, then
  `channel-add-to-queue` calls `window.sift.queue.add(selectedUrls, spec)` —
  selected channel videos are queued exactly like URLs pasted into the Queue
  page. `QueueSpecControls` fires `onChange` once on mount with its default
  spec (best video, no maxres, no transcript/summarize), so the Add-to-queue
  button is usable the instant videos are selected, with no extra click
  needed to "confirm" a spec.
- **Library → channel deep-link** (`apps/desktop/src/renderer/App.tsx`
  `handleOpenChannel`, `.../library/media-detail.tsx`
  `media-detail-open-channel`): clicking "Open channel" on a Library video's
  detail page calls `channels.openForMedia(mediaId)`, and on success stashes
  the returned `ChannelRecord` as `focusChannel` state and switches the main
  view to Channels; `ChannelsPage` picks up `focusChannel` in a `useEffect`,
  prepends it to the list if it isn't already there, and opens its detail
  view directly — so the whole jump (Library row → tracked-and-open channel)
  is one click. A resolve failure (no channel link on the video, or an
  auth/bot-check error from yt-dlp) is caught and swallowed — the click is a
  silent no-op rather than an error toast, since "this video has no
  resolvable channel" isn't actionable for the user.
- **Outlier badge** (`packages/core/src/channel/outlier.ts`,
  `apps/desktop/src/renderer/routes/channels/channel-detail.tsx`): pure,
  dependency-free like the rest of `core/channel`. `medianViews(videos)`
  takes the median `viewCount` across whatever page of videos is **currently
  listed** in the Get-videos result — the `count`/`order` combo the user has
  loaded (default 25, and `order: "most_viewed"` changes which pool that is)
  — not the channel's whole catalog. `outlierScore(viewCount, median)` is
  `viewCount / median` (`null` if either input is missing or median is 0);
  any video scoring at or above `OUTLIER_THRESHOLD = 2` renders a
  `data-testid="channel-video-outlier-<externalId>"` badge (`"<score>×"`)
  next to its title, with a tooltip and the `README.md` feature line both
  worded to match what's actually computed — the listed page's median, not
  a channel-wide figure. No age normalization: yt-dlp's flat-playlist dump
  carries no upload date, so an old evergreen hit can read as an outlier
  (see the `ponytail` comment in `outlier.ts` for the reasoning and what a
  real fix would need).

### Offline channel-tools e2e

`apps/desktop/e2e/channels.spec.ts` exercises add → detail → get videos →
select → queue, fully offline, reusing the same `SIFT_E2E_FIXTURE_DIR` hook
as every other spec — no new fixture _mechanism_, just a fuller canned
payload. `fixtureYtDlpRunner().flatPlaylist()` in `main/index.ts` returns
`FIXTURE_CHANNEL_JSON` (finalized in this phase from Task 3's placeholder)
regardless of the requested `items` slice, shaped like a real yt-dlp channel
dump: `channel_id: "UC_fixture"`, `channel: "Fixture Channel"`,
`uploader_id: "@fixture"`, `channel_follower_count: 4242`,
`playlist_count: 3`, a near-square avatar thumbnail plus a wide (`2048x288`,
`id: "banner"`) banner thumbnail, and two `entries` (`fixv1`/`fixv2`) with
real titles, durations (`600`/`45` seconds), and view counts (`100`/`900`) —
enough for `normalizeChannel`/`normalizeChannelEntries` to produce a
realistic `ChannelRecord` and video list the spec can assert real content
against (title text, video rows appearing), not just placeholder ids. Because
`ChannelService` takes the same injected `runner` as the rest of the fixture
branch, `add`/`listVideos`/queueing all work end-to-end with no
channel-specific fixture branching in `ChannelService` itself. The spec adds
`https://www.youtube.com/@fixture`, asserts the row shows "Fixture Channel",
opens the detail view, clicks Get videos, asserts a `channel-video` row is
visible, selects all, adds to queue, then switches to the Queue page and
asserts a `queue-item` appears — proving the channel → queue handoff uses the
same `queue:add` path a manually-pasted URL would.

**Human-test caveat:** the offline e2e proves the UI/IPC/DB pipeline
end-to-end against a canned two-video channel, but it never shells out to a
real `yt-dlp --flat-playlist`, so it can't verify behavior against a real
channel's actual dump shape (missing thumbnails on some channels, shorts
mixed into the `videos` tab, view counts absent for some extractors). A human
pass: paste a real channel URL into Channels, confirm it adds with a correct
avatar/title, pull latest/oldest/most-viewed (confirm the "view counts
unavailable" note shows up if a channel doesn't report them), switch to the
Shorts tab, select a few videos, and queue them; then from a Library video
click "Open channel" and confirm it lands on that channel's detail view.

### Subscriptions

The Channels route has a **Subscriptions** tab. **Sync** runs `yt-dlp --flat-playlist -J` on
`youtube.com/feed/channels` with the sign-in cookies, persists the list to the `subscription`
table (migration 009), and shows each with **Add** (import into My channels via `channel:add`)
or **Open** (already tracked). The feed is the source of truth — a re-Sync prunes channels you
unsubscribed from. Offline e2e: `subscriptions.spec.ts` (fixture `feed/channels` dump).

## Packaging (Windows)

`apps/desktop` produces a Windows NSIS installer via `electron-builder`, configured in
`apps/desktop/electron-builder.yml` (appId `app.sift.desktop`, productName `Sift`).

**Build:**

```bash
pnpm --filter @sift/desktop run rebuild   # native better-sqlite3 build matching Electron's ABI
pnpm --filter @sift/desktop run dist      # electron-vite build + electron-builder --win
```

Output: `apps/desktop/dist/Sift Setup <version>.exe`. `better-sqlite3` (and any other `.node`
addon) is unpacked from `app.asar` via `asarUnpack` so it loads correctly as a native module —
verified by inspecting `apps/desktop/dist/win-unpacked/resources/app.asar.unpacked/`.

electron-builder can't resolve an installed Electron version from a semver range
(`"electron": "^43.4.1"`) through pnpm's hoisted `node_modules` in this monorepo, so
`electron-builder.yml` pins `electronVersion` explicitly to the version actually installed
(check with `node -p "require('electron/package.json').version"`) — bump it by hand when the
`electron` devDependency is upgraded.

**Signing:** the build is **unsigned by default** — no certificate is configured, so end users
will hit a Windows SmartScreen "unknown publisher" warning on first run. To produce a signed
build, set these environment variables before running `dist`:

- `CSC_LINK` — path or URL to a `.pfx` code-signing certificate
- `CSC_KEY_PASSWORD` — the certificate's password

When both are set, electron-builder signs the packaged executable and installer automatically;
no config changes are needed.

**Known blocker — `winCodeSign` requires Windows Developer Mode:** electron-builder 25.x
downloads a `winCodeSign` tool bundle while packaging _any_ Windows target (NSIS included), even
for a fully unsigned build with no `CSC_LINK` set. That archive contains macOS `.dylib` files
stored as real symlinks; extracting them via `7za.exe` requires either Windows Developer Mode
(Settings → Privacy & security → For developers → Developer Mode) or an elevated
(Administrator) shell — neither of which this repo's dev machine had available non-interactively.
Without one of those, `pnpm --filter @sift/desktop run dist` fails at the very last step
(installer creation) with:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client. : ...\darwin\10.12\lib\libcrypto.dylib
```

despite the app itself packaging correctly (`dist/win-unpacked/Sift.exe` + asar +
unpacked `better-sqlite3` are all produced without error). Setting `win.verifyUpdateCodeSignature:
false`, `CSC_IDENTITY_AUTO_DISCOVERY=false`, or `SIGNTOOL_PATH` (pointing at a system Windows SDK
`signtool.exe`) do **not** avoid the download — it isn't gated by any of those. The only known fix
is enabling Developer Mode (or running the build as Administrator) on the machine producing the
release build; do this once on CI/release runners rather than per-developer.
