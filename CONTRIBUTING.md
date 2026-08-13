# Contributing

## First build: the native-module gotcha

`better-sqlite3` is a native addon compiled against **Electron's ABI, not Node's**.
After `pnpm install` you must recompile it before the app will start:

```sh
pnpm install
pnpm --filter @sift/desktop run rebuild
```

**Use `run rebuild`, with `run`.** Bare `pnpm --filter @sift/desktop rebuild` (no `run`)
is captured by pnpm's own built-in `rebuild` command instead of the `"rebuild"` script
in `apps/desktop/package.json` — same name, different behavior, and it will not
recompile `better-sqlite3` against Electron's ABI. This is the single most common
first-build failure. Re-run it after any Electron version bump, too.

```sh
pnpm dev   # launch the app in dev
```

## The gate

CI (`.github/workflows/ci.yml`) runs, in order:

```sh
pnpm typecheck && pnpm test && pnpm lint && pnpm build
```

Run the same locally before opening a PR. `pnpm --filter @sift/desktop e2e` (Playwright)
is not part of CI — run it locally when touching a flow it covers.

## Architecture rules

Read [`CLAUDE.md`](./CLAUDE.md) and [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)
before changing a flow — `docs/DEVELOPMENT.md` documents every flow file-by-file with
`data-testid`s. The hard rules:

- **The renderer never imports Node.** It calls `window.sift.*`, typed by `SiftApi`.
- **IPC is contract-first.** Add a channel in this order: declare the channel + payload
  type once in `packages/ipc-contract`, handle it in `apps/desktop/src/main/ipc/`,
  expose it in `apps/desktop/src/preload/index.ts`, then consume it in the renderer.
  The contract package is the single source of truth — don't wire a handler before the
  type exists.
- **Brand strings come only from `@sift/core` `branding`** — never hardcode the app
  name in code.

## Pull requests

Keep commits scoped and use [Conventional Commits](https://www.conventionalcommits.org/)
style messages (`feat: …`, `fix: …`, `docs: …`). Describe what you tested — the gate
result, plus any manual pass for flows the offline e2e fixtures can't cover (real
network calls, real AI providers — see the "human-test caveat" notes in
`docs/DEVELOPMENT.md`).
