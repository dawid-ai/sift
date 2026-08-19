# Sift

Sift downloads media from ~1800 [yt-dlp](https://github.com/yt-dlp/yt-dlp)–supported
sites, transcribes it, and summarizes it — chained together locally, with your own AI
key. Your media and API keys never leave your machine. Tools like
[Stacher](https://stacher.io/) stop once the file is on disk. Local Whisper apps like
[Buzz](https://github.com/chidiwilliams/buzz) or
[Vibe](https://github.com/thewh1teagle/vibe) transcribe but don't download, summarize,
or keep a searchable library. Cloud tools like NotebookLM or Eightify summarize but only
read captions that already exist and never give you the media file — free use is
usage-capped (NotebookLM) or subscription-gated (Eightify) rather than open-ended. Sift
does the whole chain — download, transcribe (even with no captions, via local
[whisper.cpp](https://github.com/ggerganov/whisper.cpp)), summarize, and keep a
searchable library — on your machine, with no subscription.

<!-- Screenshots/GIF go here once captured — see docs/images/CAPTURE.md. -->

## Download

**[⬇ Download Sift for Windows](https://github.com/dawid-ai/sift/releases/latest/download/Sift-Setup.exe)** — always the latest build.
**macOS and Linux are not built yet** (planned, not started — see [`docs/FAQ.md`](./docs/FAQ.md)).

Or browse [all releases](https://github.com/dawid-ai/sift/releases). The installer is unsigned,
so Windows SmartScreen shows an "unknown publisher" prompt — choose _More info → Run anyway_.
The app offers you updates after that (it always asks). Both points are explained in the [FAQ](./docs/FAQ.md).

## Features

- **Download** any yt-dlp-supported video/audio, with per-format options and a **queue**
  for batching many URLs through download → transcript → summarize unattended (pause/resume,
  reorder, retry-only-failed, and crash recovery if the app closes mid-run).
- **Transcribe** from captions, or fully offline with local
  [whisper.cpp](https://github.com/ggerganov/whisper.cpp) when a video has none. Export any
  timed transcript as `.srt` subtitles.
- **Import local audio/video** — drop a file onto the window, or use the file picker, and
  it's transcribed directly, no download step.
- **Slides** — pull the data-bearing frames (slides, charts, on-screen text) out of a video,
  dedupe them automatically, and OCR-gate them so only frames actually carrying text survive.
  Crop, curate, then export a document that interleaves the transcript and slides by timestamp
  as Markdown or PDF — raw, or AI-polished into a dense knowledge document. Nothing else in
  either the downloader or local-Whisper category does this.
- **Summarize** with your own AI key — Anthropic, OpenAI, Ollama (local, free), a custom
  OpenAI-compatible endpoint, or the Claude Code CLI provider (uses an existing `claude`
  login instead of an API key). Keys are stored encrypted at rest.
- **Prompt library** — author and edit your own prompts alongside a seeded creator pack
  (YouTube chapters, title ideas, description, podcast show notes, blog post, newsletter
  issue, short-form moments — all editable), with export/import as JSON so a set can be
  shared. A prompt carrying the `{{TIMESTAMPS}}` marker gets a timestamped transcript, so
  chapters and clip timings are read off the real transcript rather than invented.
- **Prompt playground** — a separate scratch space in Settings to test prompt wording
  against a pasted transcript before committing to it; output isn't saved, and it starts
  from the document-polish prompt rather than a library entry.
- **Library** with full-text search, tags (multi-select, negative filter), channel/platform
  filters, and a synced, click-to-seek in-app player.
- **Channels & subscriptions** — track a channel, see new-video counts, browse
  videos/shorts/live, batch-queue a selection, and sync your YouTube subscriptions via the
  sign-in browser. Videos beating the median view count of the currently listed videos get
  an outlier badge (competitor-research signal; not adjusted for video age).
- **Sign-in browser** — an in-app browser window for signing in to gated sites; the cookie
  jar is handed to yt-dlp so members-only and age-restricted media works. Cookies never
  leave the machine.
- **Files tab** — every transcript, summary, and exported document for a video, one click
  from "Open" to the actual file on disk.
- **Plex export** — write `.m3u` playlists for your filtered library.

## Money model

Free. [MIT](./LICENSE)-licensed. No subscription, no telemetry, no accounts, no
monetization planned.

## Develop

Requires Node 22+ and pnpm 9+ — see [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the
native-module gotcha you'll hit on first install.

```sh
pnpm install
pnpm --filter @sift/desktop run rebuild   # required after install — see CONTRIBUTING.md
pnpm dev        # launch the desktop app in dev

pnpm test       # unit tests (Vitest)
pnpm typecheck  # strict TS across all packages
pnpm lint       # ESLint
pnpm --filter @sift/desktop e2e   # Playwright smoke test (build first)
```

Build a Windows installer: `pnpm --filter @sift/desktop dist`.

Release notes live in [`UPDATES.md`](./UPDATES.md). Architecture and per-flow docs are in
[`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md).

## License

[MIT](./LICENSE) © [Dawid Jóźwiak](https://dawid.ai)
