# Updates

## v0.0.9 — 2026-08-02

- Tag box on Home now suggests your existing tags as you type.
- New setting: "Get transcript after download" (on by default) — a toggle to control whether
  transcribing runs automatically once a video finishes downloading. Leaving it on means a
  caption-less video already has its file ready for local Whisper transcription.

## v0.0.8 — 2026-08-01

- The Library now loads one page at a time, so large libraries stay fast. Pager with
  First/Prev/numbered/Next/Last, a page indicator, and a result count.
- Choose how many videos show per page (24/48/96/200) — remembered between sessions.
- Jump straight to a page number when you have many pages.
- Channel, platform, and tag filters now cover your whole library, not just the current page.

## v0.0.7 — 2026-07-31

- Update prompts now show release notes as clean text (raw HTML tags no longer leak through).

## v0.0.6 — 2026-07-31

- More reliable update detection on launch — an update found at startup now consistently
  shows the prompt (previously it could be missed on a fast check).

## v0.0.5 — 2026-07-31

- Add tags to a video right from the Home screen when you download it.
- Summarizing with Ollama now checks it's running first, and offers to start it (or a link
  to install it) instead of failing silently.

## v0.0.4 — 2026-07-30

- In-app auto-updates: Sift checks for a new version on launch and offers a one-click
  update — download progress, then restart to finish.
- Added a "Check for updates" button in Settings.

## v0.0.3 — 2026-07-30

- New dark-slate + teal visual theme — a modern "gaming launcher" look.
- Left sidebar navigation replacing the old top button bar, with a glowing active item.
- Restyled buttons, cards, badges, and inputs with depth and accent glow.
- Accessibility polish: stronger contrast and clearer keyboard/assistive-tech nav semantics.

## v0.0.2 — 2026-07-30

- Migrations are now crash-safe: each runs in a single transaction, so an
  interrupted upgrade can no longer wedge startup.
- Downloaded-from-this-channel backfill skips unrelated videos on launch (faster start).
- Video poster now renders as an image (robustness fix).
- Assorted internal cleanups: clearer typings, doc fixes, and packaging metadata.

## v0.0.1 — 2026-07-16

- First packaged Windows build (NSIS installer, auto-update wiring).
- Download, transcribe (captions or local Whisper), and summarize media from
  ~1800 yt-dlp–supported platforms.
- Library with search, tags, channel tools, subscriptions, and Plex M3U export.
- In-app video player with a synced, click-to-seek transcript.
