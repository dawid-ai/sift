# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Sift is

Cross-platform Electron desktop app to download, transcribe, and summarize media
from yt-dlp–supported platforms. Local-first: media and API keys never leave the
machine. pnpm workspace monorepo, strict TypeScript, MIT.

## Commands

```sh
pnpm install
pnpm --filter @sift/desktop run rebuild   # REQUIRED after install / Electron bump — see gotcha below
pnpm dev            # launch app in dev (electron-vite)

pnpm test           # all unit tests (Vitest, per-package)
pnpm typecheck      # strict TS across every package
pnpm lint           # ESLint

pnpm --filter @sift/desktop e2e        # Playwright (builds first)
pnpm --filter @sift/core test          # single package's tests
pnpm --filter @sift/desktop dist       # Windows installer (electron-builder)
```

Run one test file: `pnpm --filter @sift/core exec vitest run src/transcript/vtt.test.ts`.
Run one e2e spec: `pnpm --filter @sift/desktop exec playwright test e2e/download.spec.ts` (build once first).

## Native-module gotcha (read before debugging install failures)

`better-sqlite3` is a native addon compiled against **Electron's ABI, not Node's**.
After every `pnpm install` or Electron version bump it must be recompiled:

- Use `pnpm --filter @sift/desktop run rebuild` — **with `run`**. Bare
  `pnpm --filter @sift/desktop rebuild` hits pnpm's built-in rebuild command
  (relinks the whole tree, intermittently fails with `ERR_PNPM_EISDIR` on this
  repo's exFAT volume), not the package's `electron-rebuild` script.
- The repo's exFAT drive has no hard-link support, so `.npmrc` forces
  `package-import-method=copy` and `better-sqlite3` is deliberately kept out of
  `pnpm.onlyBuiltDependencies` (its Node-ABI build fails here and isn't needed).

## Architecture

Three-process Electron app. The hard rules:

- **Renderer never imports Node.** It calls `window.sift.*`, typed by `SiftApi`.
- **IPC is contract-first.** Every channel + payload type is declared once in
  `packages/ipc-contract`, then handled in `apps/desktop/src/main/ipc/`, exposed
  in `apps/desktop/src/preload/index.ts`, and consumed in the renderer. Add IPC
  in that order — the contract package is the single source of truth.
- **Brand strings come only from `@sift/core` `branding`** — never hardcode the
  app name.

### Packages

- `apps/desktop` — the Electron app: `src/main` (Node side: `ipc/`, `services/`,
  `sidecars/` yt-dlp/ffmpeg/whisper wrappers, `ai/` providers, `secrets.ts`,
  `paths.ts`, `settings/`), `src/preload`, `src/renderer` (React + Tailwind,
  `routes/` per feature, `lib/` hooks/helpers).
- `packages/core` — framework-free domain code (no Electron, no Node addons):
  platform registry/tiering, filename building, transcript types + VTT parsing,
  AI provider **types + registry**.
- `packages/db` — better-sqlite3 schema, numbered SQL migrations, per-table
  accessors (`media`, `transcript`, `summary`, `prompt`, `asset`, …).
- `packages/binaries` — on-demand yt-dlp/ffmpeg resolution + download-and-verify
  (sha256 from the release's own checksum file, never computed pre-download).
- `packages/ipc-contract` — renderer⇄main channel + type definitions.

### Recurring patterns

- **Provider registries** (transcript in `@sift/core/transcript`, AI in
  `@sift/core/ai`): ordered list, first `canHandle`/registration wins. New
  providers (Whisper, OpenAI, Ollama, custom) register at a call site in
  `main/index.ts` without touching resolution logic.
- **Services** own a flow end-to-end (metadata → download → transcript →
  summarize → library), persist via `@sift/db`, and stream progress/tokens over
  dedicated push channels (`download:progress`, `summarize:token`, …) to every
  open window. IPC handlers let errors propagate so `ipcMain.handle` rejects the
  renderer's `invoke()` — no separate error channels.
- **Secrets**: BYO API keys encrypted at rest via Electron `safeStorage`
  (one blob per provider under `userData/secrets/`). Never falls back to
  plaintext; an undecryptable blob reads as "no key".

### Offline e2e fixtures

Every Playwright spec runs against fakes — no real yt-dlp/ffmpeg/network/API
keys. `SIFT_E2E_FIXTURE_DIR` (set per spec) flips `main/index.ts` to fixture
runners/providers and redirects downloads to a temp dir. Fixture stubs resolve
synchronously, so specs assert **terminal** states (`download-done`,
`transcript-panel`, `summary-content`), not mid-flight frames. Real-binary /
real-API behavior needs a documented human tuning pass (see DEVELOPMENT.md
"human-test caveat" notes per flow).

## Deep reference

`docs/DEVELOPMENT.md` documents every flow (metadata, download, transcript,
summarize, providers, library, channels/subscriptions, queue, whisper, auth,
player, tags, playlist export, updates) file-by-file with `data-testid`s. Read
the relevant section there before changing a flow. Release process:
`.claude/skills/release-update/SKILL.md` (`/release-update`); notes in `UPDATES.md`.
