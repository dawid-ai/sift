# Sift

Cross-platform desktop app to **download, transcribe, and summarize** media from
~1800 [yt-dlp](https://github.com/yt-dlp/yt-dlp)–supported platforms. Local-first,
open-source, no servers — your media and API keys never leave your machine.

## Features

- **Download** any yt-dlp-supported video/audio, with a queue and per-format options.
- **Transcribe** from captions or locally with [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — no cloud, works offline.
- **Summarize** with your own AI key (OpenAI, Anthropic, Ollama, or a custom endpoint). Keys are stored encrypted at rest.
- **Library** with full-text search, tags, and a synced, click-to-seek in-app player.
- **Channels & subscriptions** — browse a channel's videos, track subscriptions, batch-download.
- **Plex export** — write `.m3u` playlists for your filtered library.

## Develop

Requires Node 20+ and pnpm 9+.

```sh
pnpm install
pnpm dev        # launch the desktop app in dev

pnpm test       # unit tests (Vitest)
pnpm typecheck  # strict TS across all packages
pnpm lint       # ESLint
pnpm --filter @sift/desktop e2e   # Playwright smoke test (build first)
```

Build a Windows installer: `pnpm --filter @sift/desktop dist`.

Release notes live in [`UPDATES.md`](./UPDATES.md).

## License

[MIT](./LICENSE) © [Dawid Jóźwiak](https://dawid.ai)
