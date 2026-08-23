# Real-device test matrix

The automated suites cover logic and workflows against fakes: `pnpm test` (Vitest) and
`pnpm --filter @sift/desktop e2e` (Playwright, fixture runners, no network). Neither can
reach the conditions below, which are where a desktop app on someone else's machine
actually breaks.

Run the **Before a release** column on a real Windows install before tagging. Everything
marked _automated_ is already enforced by the gate and needs no manual pass.

## Environment

| Scenario                                                                                   | Why it breaks                                                                                                                           | Covered by                                                                                                                                     |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Non-ASCII Windows username (`C:\Users\Zoë`) and media titles                               | Paths reach yt-dlp, ffmpeg, and SQLite as argv and as filenames; a mis-encoded path fails at the child-process boundary, not in the app | automated — `packages/core/src/filename/sanitize.test.ts`, `apps/desktop/src/main/local-file.test.ts`, `sidecars/ytdlp.test.ts` (UTF-8 stdout) |
| Path with spaces, `#`, `&`, or `%` in it                                                   | Same boundary; also the `sift-media://` and `sift-frame://` protocol handlers, which URL-encode                                         | automated — `local-file.test.ts`; **manual**: import a file from such a folder and play it in-app                                              |
| Windows display scaling at 125% / 150% / 175%                                              | Layout, hit targets, and the frame-crop overlay work in CSS pixels; a fractional `devicePixelRatio` is where crop rectangles drift      | **manual** — set scaling in Windows display settings, then crop a video in Slides and confirm the exported frame matches the rectangle         |
| Second monitor with a different scale factor                                               | Chromium re-rasterises on move                                                                                                          | **manual** — drag the window between monitors mid-download                                                                                     |
| No secure storage (`safeStorage` unavailable — some Windows accounts, some Linux desktops) | An API key must never fall back to plaintext                                                                                            | automated — `apps/desktop/src/main/secrets.test.ts`; the report also surfaces it (`security.secureStorageAvailable` in the support bundle)     |
| Fresh install, no managed binaries yet                                                     | First run downloads yt-dlp/ffmpeg and verifies sha256 against the release's own checksum file                                           | automated — `packages/binaries`, `e2e/binaries.spec.ts`; **manual**: confirm the first-run prompt on a machine that has never run Sift         |

## Failure conditions

| Scenario                                       | Why it breaks                                                                                | Covered by                                                                                                                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No internet                                    | Every network path must fail with a message, not a hang                                      | **manual** — disable the adapter, then: fetch metadata, refresh a channel, check for updates, summarize with a cloud provider                                                              |
| Network drops mid-download                     | yt-dlp exits non-zero partway; the download row must land on `error`, not stay `downloading` | **manual** — start a long download, disable the adapter; on relaunch, `resetStaleDownloads` must clear it (`apps/desktop/src/main/maintenance.ts`)                                         |
| Low disk (< 1 GB free on the downloads volume) | yt-dlp and ffmpeg fail late, after partial writes                                            | **manual** — the support bundle reports `storage.downloadsFreeBytes`; check the error is legible and the library row does not claim `done`                                                 |
| Very long media (3h+, 4K)                      | Whisper runtime, transcript size, frame count, and PDF export memory                         | **manual** — the PDF export refuses a selection over 96 MB of images with a named limit (`services/frame-export-service.ts`); confirm the message, then export the same slides as Markdown |
| Corrupt or unreadable `sift.db`                | The app must start and say so, not crash to a blank window                                   | **manual** — truncate `%APPDATA%/Sift/sift.db`, relaunch; `db:isReady` stays false and the UI shows the database error state                                                               |
| Corrupt settings JSON                          | Every store must fall back to its default                                                    | automated — each `settings/*.test.ts` has a corrupt-JSON case                                                                                                                              |
| Power loss during a settings or key write      | A half-written file loses the setting or the API key                                         | automated — writes go through `writeFileAtomicSync` (`apps/desktop/src/main/atomic-write.test.ts`)                                                                                         |
| Killed mid-queue                               | Queue items left `running` must be recovered                                                 | automated — `QueueWorker.recover`, `services/queue-worker.test.ts`                                                                                                                         |

## Install and update

| Scenario                                                        | Covered by                                                                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Clean install from the NSIS installer, per-user, non-admin      | **manual** — `pnpm --filter @sift/desktop dist`, run `dist/Sift-Setup.exe`                                        |
| Install over a previous version, library and settings preserved | **manual** — install the previous release, add a video, install the new one, confirm the library and keys survive |
| SmartScreen prompt on first run of an unsigned build            | **manual** — expected until code signing is set up; the README and FAQ both say so                                |
| Uninstall leaves `%APPDATA%/Sift` in place                      | **manual** — the library is the user's data; the uninstaller must not delete it silently                          |

## Accessibility and appearance

| Scenario                                             | Covered by                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Keyboard-only navigation of the five top-level views | automated — `e2e/a11y.spec.ts`                                                                                                          |
| WCAG 2.1 AA violations (contrast, names, roles)      | automated — `e2e/a11y.spec.ts`, failing on `serious`/`critical`                                                                         |
| Layout at 900 / 1280 / 1800 px                       | opt-in — `SIFT_VISUAL=1 pnpm --filter @sift/desktop exec playwright test e2e/visual.spec.ts` (baselines are local, see the spec header) |
| Windows high-contrast mode                           | **manual**                                                                                                                              |
