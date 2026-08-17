# Slides / Frame-Extraction Feature — Handover

Single source of truth for continuing this work in a fresh session.

> **Git state (2026-08-07): all shipped — working tree clean.** The raw slides feature was
> **v0.1.0**; the AI-polish tiers / Claude CLI provider / Files hub / Save slides / prompt
> playground / transcripts+summaries-as-files all shipped in **v0.2.0**; the cosmetic batch +
> new app icon + README download link shipped in **v0.2.1** (tags `v0.2.0`, `v0.2.1` pushed,
> GitHub Releases published, installer = `Sift-Setup.exe` versionless via `releases/latest/download/`).
> Nothing here is uncommitted anymore. Normal repo rules apply again: branch off master for new work.
>
> **Still needs a real-hardware pass (NOT offline-testable — shipped unverified on real binaries):**
>
> 1. **Whisper progress bar** — the `-pp` flag + `progress = N%` stderr regex are from whisper.cpp
>    docs; confirm the bar actually moves on a live re-transcribe (`sidecars/whisper.ts`,
>    `transcript-panel.tsx` testid `transcript-progress`). Flag name could differ by build.
> 2. **Claude CLI provider** (`ai/claude-cli-provider.ts`) — real `claude -p` polish/summarize
>    (offline-tested only; watch stdin vs arg, empty/hung output).
> 3. **AI-polish output quality** — tune `POLISH_SYSTEM_PROMPT` against real `claude` / real Ollama
>    (use Settings → Prompt playground).
> 4. **Tesseract offline** (task #7) — still downloads `eng.traineddata` on first OCR run; vendor it
>    - `extraResources` + `langPath` before claiming full offline.
> 5. **Dev-mode window icon** — packaged `.exe` has the new icon; `pnpm dev` still shows Electron's
>    default (set `BrowserWindow({ icon })` if it bothers you). Cosmetic only.

---

## LATEST SESSION (read this first)

Built on top of v0.1.0. **Gate is green** (typecheck, lint, ~509 unit, build, 30 e2e) but the
AI-polish output quality still needs real-`claude` tuning. Spec:
`docs/superpowers/specs/2026-08-06-ai-polished-document-export-design.md`.

### Done this session (uncommitted)

- **AI-polished document export — distillation, not cleanup.** The polish now feeds the WHOLE
  transcript to the model in ONE call, with `[[SLIDE n]]` placeholders, and asks for a dense
  KNOWLEDGE DOCUMENT (headers/paragraphs/bullets, substance only — no filler/questions/discovery),
  keeping/repositioning the markers; images are spliced back in. Core: `packages/core/src/frames/document.ts`
  (`toMarkeredTranscript`, `fromMarkeredOutput`, `markdownToHtml`, block renderers). Prompt:
  `POLISH_SYSTEM_PROMPT` in `packages/core/src/ai/prompt.ts` (user confirmed the new output is "much better").
- **Three tiers**, chosen via the "Polish with" selector in the Slides tab: No AI (raw) · local
  (Ollama) · external (Anthropic/OpenAI/custom **+ new Claude Code CLI provider**).
- **Claude Code CLI provider** `apps/desktop/src/main/ai/claude-cli-provider.ts` — shells
  `claude -p --model <opus|sonnet|haiku>` (subscription, keyless), prompt on **stdin**. First-class
  everywhere; registered globally; `isClaudeCliAvailable` probes `claude --version`. v1 non-streaming.
- **Default AI provider** setting (Settings) + persisted store `settings/ai-default-config.ts`;
  `useAiPickers` seeds from it. CLI Detected/Not-found badge + ToS note in Settings.
- **Files tab = artifacts hub** — new `document` table (migration **015**), `packages/db/src/documents.ts`;
  export records a row; `MediaDetail.documents`; `files-panel.tsx` lists Documents / Transcripts /
  Summaries / Prompts-run, with Downloads below. `detail()` reload after export surfaces new docs.
- **Save slides** — `frames:saveSelected` IPC: folder picker → copies selected slides at native res
  (frames are stored full-res already). Button in `slides-panel.tsx`.
- **Prompt playground** (Settings global tool) `prompt-playground-section.tsx` + `ai:runPrompt` IPC —
  paste transcript + edit prompt + run through a provider; for tuning (edits are local, not persisted).

### ✅ DONE — transcripts & summaries are now files on disk + "Open" everywhere

Transcripts and prompt outputs were **DB-only** (no file to open). Now auto-written on create so
every Files-panel row can reveal a real file:

- **Migration 016** (`016-artifact-file-path.sql.ts`): `ALTER TABLE transcript/summary ADD COLUMN
file_path TEXT` (nullable — old rows / write-failures stay null; DB text is source of truth).
  `migrations.test.ts` count 15→16.
- **DB**: `TranscriptRow`/`SummaryRow` gain `file_path`; new `setTranscriptFilePath` /
  `setSummaryFilePath` setters (insert unchanged — path set after the write). Exported from db index.
- **TranscriptService.runGet**: after insert, writes `<base>__transcript-<providerId>.txt` to
  `downloadsDir` (new injected opt), best-effort try/catch. Provider in the name keeps captions vs
  whisper distinct. `toRecord` carries `filePath`.
- **SummarizeService**: extracted `writeSummaryFile(row)` (`<base>__<prompt|summary>.md`), called by
  both `start` (auto, best-effort) and the existing `export()`. Both now `setSummaryFilePath`.
- **IPC contract**: `TranscriptRecord.filePath` + `SummaryRecord.filePath` (`string | null`).
  `download-service.ts` detail mapper fills them.
- **UI** `files-panel.tsx`: Transcripts/Summaries rows show **Open** (reveal file, when `filePath`)
  next to **Go to** (tab jump). "Prompts run" rows show **Open** too (summary `filePath` / document `path`).
- **Rename** `Show in folder` → **Open** on downloads-panel, library-page export toast, media-card.
- **Caveat**: re-running the same prompt overwrites its `.md` (name has no id); multiple summary rows
  then share one file. ponytail: add an id suffix if per-row files matter. Transcript names include
  providerId so captions/whisper don't collide.
- Gate: typecheck ✓, `pnpm -r test` (all packages) ✓, lint ✓. E2e NOT re-run (needs a build; no spec
  asserts on the Files panel or downloads-dir contents, so low risk).

### ✅ DONE — user-feedback fixes (prior; typecheck + lint + whisper tests green)

1. **Files tab count.** `media-detail.tsx` badge for the Files tab now counts
   `documents.length + transcripts.length + summaries.length + downloads.length` (everything the
   Files panel actually lists).
2. **"Open" / "Go to" rename.** `files-panel.tsx`: Documents button "Reveal" → **Open** (still
   `onReveal` = `shell.showItemInFolder`); Transcripts/Summaries tab-jump buttons "Open" → **Go to**.
3. **Whisper progress bar.** `sidecars/whisper.ts` now spawns (streaming) instead of `execFile`
   (buffered): added `-pp` (`--print-progress`), parses `progress = N%` off stderr (regex
   `/progress\s*=\s*(\d+)\s*%/`, only forwards increases), and calls a new `onProgress(ratio)` arg.
   `whisper-provider.ts` forwards it as `{ stage: "transcribing", ratio }`. `media-detail.tsx` keeps
   `transcriptRatio` state; `transcript-panel.tsx` renders a bar (`data-testid="transcript-progress"`)
   while `transcribeMode === "whisper" && ratio !== null`. **HUMAN-TEST CAVEAT:** the `-pp` flag +
   exact `progress = N%` string are from whisper.cpp docs — verify against the managed whisper-cli's
   real stderr on a live re-transcribe (regex is permissive but the flag name could differ by build).
4. **Home tier badge dropped.** `preview-card.tsx` renders just `{metadata.platform.label}`;
   removed the unused `TIER_LABELS` map (kept the `MediaMetadata` import — still used).
5. **Home tags keep case.** `preview-card.tsx` `addTag` is now `const t = raw.trim();` with a
   case-insensitive dedup (`!tags.some((x) => x.toLowerCase() === t.toLowerCase())`).

### How the user tests / tunes

- Prompt tuning: **Settings → Prompt playground** (paste a chunk of the Stanford transcript, run through
  Claude CLI, iterate). Winning prompt gets pasted back and baked into `POLISH_SYSTEM_PROMPT` by us.
- Real pipeline: `pnpm dev` → open the Stanford lecture → **Slides** → Polish with = Claude Code CLI →
  export **Markdown** → open the `.md` in `Downloads/Sift`. **Watch:** CLI reads the prompt on stdin;
  if it hangs/returns empty, switch the invocation (arg vs stdin, or `--append-system-prompt`).
- Files hub: any video → **Files** tab. Save slides: **Slides** tab → **Save slides…**.

### Deferred (agreed "later")

- Vision slide placement (pass slide images to the model so it positions them by content, not timestamp).
- CLI streaming (`--output-format stream-json`).

---

## Goal

Extract data-bearing frames (slides/charts) from a downloaded lecture/talk video, let the user
curate them, and eventually generate a document (Markdown/PDF) = transcript + selected slides.
Local-first. Target test video: a Stanford CS329A lecture in `C:\Users\jozwi\Downloads\Sift\`
(lecture-hall camera that occasionally cuts to full-screen screen-share slides).

## Current status — what works (verified: typecheck, unit, lint, build, 29 e2e, real-video)

The full pipeline is reachable in the app: **Library → open a downloaded video → Slides tab**.

- **Extract slides** button → scene-detect → grab settled frame per segment → dedup → optional
  brightness gate → optional AI classify → OCR gate → store. Progress bar (scan %, then read N/M).
- **Capture current frame** → frame-accurate grab at the player's playhead, stored as `manual`.
- **Right-click a slide** toggles include; **checkbox** does too. Deselected = dimmed, excluded
  from the summary.
- **Crop region**: "Set slide region" → drag a box on the player → per-video crop; extraction &
  capture crop to it (ffmpeg `crop=`).
- **"Only full-screen slides"** toggle → drops dark wide-room shots (brightness gate).
- **AI slide detection** dropdown (Off / `qwen2.5vl:7b` / `minicpm-v` / `gemma3:12b`) → Ollama
  vision yes/no gate. Opt-in, slow, needs `ollama pull <model>`.
- **Playback speed** buttons (0.5/1/1.5/2×, persisted); **autoplay-on-slide-click** toggle
  (default off, persisted). Bigger player (page `max-w-7xl`, player column `1.7fr`).
- Extracted slide OCR text is folded into the **summary** (timestamped section, no provider change).

## The pipeline (where each concern lives)

```
detectSceneTimes (ffmpeg, downscaled scan)      sidecars/ffmpeg.ts
  → settledGrabTimes (segment MIDPOINTS)         services/frame-service.ts
  → per grab: extractFrameAt (hybrid seek+crop)  sidecars/ffmpeg.ts
      → dedup (dHash, distance ≤6)               core/frames/dhash.ts
      → [fullScreenOnly] brightness gate ≥0.6    core/frames/brightness.ts
      → [classifier] Ollama vision yes/no         services/frame-classifier.ts
      → OCR gate (tesseract.js, ≥5 words ≥60%)   sidecars/ocr.ts + core/frames/keep.ts
      → insert frame row                          packages/db/src/frames.ts
```

## File map

**New files:**

- `packages/core/src/frames/keep.ts` — `isDataFrame` OCR gate + `KEEP_FRAME_DEFAULTS` (minWords 5, minConfidence 60)
- `packages/core/src/frames/dhash.ts` — `computeDHash`, `hammingDistance`, `isDuplicateHash`, `DUPLICATE_MAX_DISTANCE = 6`
- `packages/core/src/frames/brightness.ts` — `brightPixelFraction`, `MIN_FULLSCREEN_BRIGHT_FRACTION = 0.6`
- `packages/db/src/frames.ts` — `frame` table accessor (insert/list/delete/deleteAuto/setIncluded/existsByImagePath)
- `packages/db/src/frame-crop.ts` — `frame_crop` accessor (get/set/clear), `FrameCrop {x,y,w,h}` fractions
- `packages/db/src/migrations/012-frame.sql.ts` (frame table), `013-frame-included.sql.ts` (included col), `014-frame-crop.sql.ts` (crop table)
- `apps/desktop/src/main/sidecars/ocr.ts` — injectable Tesseract runner (`createOcrRunner`, `toOcrResult`)
- `apps/desktop/src/main/services/frame-service.ts` — `FrameService.extract` + `captureFrame`, `settledGrabTimes`, `SETTLE`/midpoint logic
- `apps/desktop/src/main/services/frame-classifier.ts` — `createOllamaSlideClassifier`, `parseSlideAnswer`
- `apps/desktop/src/main/ipc/frames.ts` — `registerFramesIpc` (extract/capture/list/setIncluded/getCrop/setCrop)
- `apps/desktop/src/renderer/routes/library/slides-panel.tsx` — the Slides tab UI
- `apps/desktop/e2e/frames.spec.ts` — offline e2e (extract → include toggle → right-click → capture → crop drag)
- `*.test.ts` alongside each of the above

**Modified files:**

- `apps/desktop/src/main/sidecars/ffmpeg.ts` — `buildSceneScanArgs`, `detectSceneTimes` (streaming), `buildFrameAtArgs` (hybrid seek + crop), `parseFfmpegTime`. `extractWav` unchanged.
- `apps/desktop/src/main/index.ts` — constructs `FrameService` + `sift-frame://` protocol + fixture branch (`fixtureFrameService` w/ `FIXTURE_JPEG`); registers frames IPC
- `apps/desktop/src/main/paths.ts` — `framesDir(mediaId)`, `framesRootDir`, `tesseractCacheDir`
- `apps/desktop/src/main/services/summarize-service.ts` — folds included frames' OCR into `assembleSummaryContent`
- `apps/desktop/src/main/preload/index.ts` — exposes `window.sift.frames.*`
- `apps/desktop/src/renderer/index.html` — CSP `img-src` adds `sift-frame:` (was blocking images)
- `apps/desktop/src/renderer/routes/library/media-detail.tsx` — Slides tab wiring, crop state, classifier/fullscreen/autoplay state (localStorage), player layout
- `apps/desktop/src/renderer/routes/library/media-player.tsx` — speed controls, `getCurrentTime`, conditional autoplay seek, crop-draw overlay
- `packages/core/src/ai/prompt.ts` — `assembleSummaryContent(promptBody, transcript, frames?)` + `FrameNote`
- `packages/ipc-contract/src/index.ts` — `frames*` channels, `FrameRecord`/`FrameProgress`/`FrameCrop`, `SiftApi.frames`
- `packages/db/src/index.ts`, `packages/core/src/index.ts`, `migrations.ts` (+ migration 012/013/014), `migrations.test.ts` (count 14)
- `apps/desktop/package.json` — added deps `tesseract.js`, `jpeg-js`

## Key decisions & calibrated constants (all tuned on the real video — DON'T blindly change)

- **Scene-detect then grab at segment MIDPOINT** (not the scene-change frame). The scene-change
  frame is the _transition_ (outgoing talking head) → the infamous "talking head a split-second
  before the slide". Midpoint = maximally far from both cuts = the stable held slide, and it
  matches wherever the player seeks. `settledGrabTimes` in `frame-service.ts`.
- **Hybrid seek** for exact frames: `-ss (t-5) -i input -ss 5 …` (fast keyframe seek + accurate
  decode). Verified 1.4s even 10 min in. A single `-ss` before `-i` lands frames early.
- **`-fps_mode vfr`** NOT `-vsync vfr` — the managed ffmpeg (N-125953) removed `-vsync`.
- **dHash dup distance = 6** (of 64 bits). 10 wrongly merged distinct slides sharing a template.
- **Brightness gate = 0.6**: full-screen light slides measured ~0.83; wide room/talking-head ~0.34–0.38. Assumes LIGHT-themed slides (dark-mode slides would be dropped — tunable).
- **OCR gate**: ≥5 words AND ≥60% mean confidence.
- **Re-extract preserves manual captures** (`deleteAutoFramesByMediaId` deletes `kind != 'manual'`).
- **Crop stored as fractions**; ffmpeg `crop=iw*w:ih*h:iw*x:ih*y` (resolution-independent).
- Images served via `sift-frame://file/<encoded abs path>` protocol, DB-allowlist gated like `sift-media`.

## Known issues / limitations

- **Tesseract OCR is online-first**: `createOcrRunner({cachePath: tesseractCacheDir()})` downloads
  `eng.traineddata` from a CDN on first run, then caches. NOT offline until the traineddata is
  vendored + `langPath` set + electron-builder `extraResources` (task #7). Flagged with `ponytail:` in `ocr.ts`.
- **llama3.2-vision is dead** on current Ollama (mllama unsupported). Dropdown uses current-engine
  models only. `qwen2.5vl:7b` is the recommended pick.
- **Classifier is slow** (VLM per surviving frame). Crop + dedup + brightness must cut the
  candidate set first. It's opt-in.
- **Brightness gate assumes light slides** — dark-theme decks get dropped.
- The Stanford video is mostly wide room shots; the crop + "full-screen only" toggle are the levers.
  Extraction quality on arbitrary videos is inherently hard (this is why the plan is: cheap local
  candidates → human curation → frontier model only on the KEEPERS).

## NEXT STEPS (in priority order)

### 1. ✅ DONE: no-AI document export (transcript + selected slides) — task #8

Shipped (typecheck, unit, lint, build, e2e all green). Zero AI, zero new deps.

- `packages/core/src/frames/document.ts` — pure `renderMarkdownDocument` / `renderHtmlDocument`;
  interleaves segments + included frames by time, coalesces adjacent segments into paragraphs.
  Format-agnostic: caller resolves image `src` (file:// for md, data: URI for html). `document.test.ts`.
- `apps/desktop/src/main/services/frame-export-service.ts` — `FrameExportService.export(mediaId, format)`.
  Loads newest transcript (`segments_json`; falls back to whole-text one block when null), included
  frames, writes `<base>__document.md|.pdf` to `downloadsDir`. `renderPdf` is INJECTED (Node-loadable).
- `renderPdf` in `index.ts` — hidden `BrowserWindow` (`javascript:false`) → temp .html → `printToPDF`
  (no new dep). Not a data: URL — embedded slide images make the HTML multi-MB.
- IPC `frames:export`; preload `frames.export`; "Create document" (PDF / Markdown) block + saved-path
  reveal in `slides-panel.tsx`; `handleExportDocument` in `media-detail.tsx` (needs a transcript to enable).
- `apps/desktop/e2e/frames-export.spec.ts` — download → transcript → extract → export md + pdf.
- Slides are IMAGES filling the transcript's gaps — no OCR/text recreation (as specified).

### ✅ DONE: AI-polished document export (Tiers 1 & 2) + Claude Code CLI provider

Built on top of the raw export. Spec: `docs/superpowers/specs/2026-08-06-ai-polished-document-export-design.md`.

- **Core** `frames/document.ts`: `buildDocumentBlocks`, `chunkText`, `polishTextBlocks` (rewrites
  each text run via an injected `polish` fn; slides are hard boundaries so placement is preserved),
  block-based renderers. `POLISH_SYSTEM_PROMPT` in `ai/prompt.ts` (clean, don't summarize).
- **Provider** `ai/claude-cli-provider.ts`: `createClaudeCliProvider` shells `claude -p --model <m>`
  (subscription, keyless); `isClaudeCliAvailable` probes `claude --version`. v1 non-streaming.
  Registered globally (like Ollama) so it's a first-class provider in summaries + polish; in
  `KNOWN_PROVIDERS`. ponytail: `--output-format stream-json` is the streaming upgrade path.
- **Service** `frame-export-service.ts`: `export(mediaId, format, polish?, onProgress)` — polish via
  `registry.get(id).summarize(POLISH_SYSTEM_PROMPT, ...)`, per-section try/catch → raw on failure,
  streams `frames:exportProgress`.
- **Default provider** setting: `settings/ai-default-config.ts` + `aiDefaultConfigFile()`, IPC
  `ai:getDefault`/`ai:setDefault`/`ai:cliStatus`, `useAiPickers` seeds from it. Settings has a
  "Default AI provider" selector + a Claude CLI Detected/Not-found card with the ToS note.
- **UI**: "Polish with" provider+model selector in the Create-document block; polish progress line.
- e2e `frames-export.spec.ts` covers raw md → pdf → polish (offline fixture provider).
- **Human-test caveat**: the real `claude` CLI and real Ollama polish need a manual tuning pass
  (not offline-testable) — document in DEVELOPMENT.md before release.

### 2. (superseded — see DONE above) Claude Code CLI provider

The user has `claude` installed + logged in (they run `claude -p ... "/decompose"` headless).
The Claude.ai subscription CANNOT be used by Sift's `@anthropic-ai/sdk` directly (that's API
credits). The ONLY subscription path is shelling out to headless Claude Code, which has vision:

- New provider "Claude Code CLI" in the AI registry (`@sift/core/ai`), spawns
  `claude -p "<prompt>"` with the selected slide image paths (Claude Code Read has vision).
- Use for the SMART per-slide extraction (charts → structured data) on curated slides only, so
  usage stays within subscription rate limits.
- Caveats to surface: requires `claude` installed+logged-in (power-user only, not shippable to
  arbitrary users); using a consumer sub to power a separate app is a ToS grey area — flag, don't gate.
- Keep the existing Anthropic/OpenAI API path for anyone who has credits.

### 3. Bundle Tesseract traineddata for offline (task #7) — before any release

Vendor `eng.traineddata` + electron-builder `extraResources` + pass `langPath` to `createOcrRunner`.

### 4. Real-video threshold tuning (ongoing)

`sceneThreshold` (ffmpeg.ts `DEFAULT_SCENE_THRESHOLD` 0.4), dHash distance (6), brightness (0.6),
OCR minWords/minConfidence (5/60). Tune on 2–3 real talks.

## Gotchas for the environment

- **pnpm store**: this machine's node_modules link to `C:\.pnpm-store\v3`. To add a dep use
  PowerShell + `--store-dir "C:\.pnpm-store\v3"` (Git Bash mangles the Windows path). Native-module
  gotcha for better-sqlite3 still applies (see root CLAUDE.md) — but tesseract.js/jpeg-js are pure JS.
- **Rebuild after install**: `pnpm --filter @sift/desktop run rebuild` (with `run`).
- **Real ffmpeg** lives at `C:\Users\jozwi\AppData\Roaming\Sift\binaries\ffmpeg.exe` (no ffprobe).
- No AI attribution in commits/PRs (root CLAUDE.md hard rule).

## Verify commands

```sh
pnpm typecheck
pnpm -r test
pnpm lint
pnpm --filter @sift/desktop build
pnpm --filter @sift/desktop exec playwright test e2e/frames.spec.ts   # build first
pnpm --filter @sift/desktop exec playwright test                      # full suite (29 specs)
```

To try it live: `pnpm dev` → download a talk with slides → open it → **Slides** tab → set a crop
box around the projected screen → **Extract slides** (first run pulls the OCR model once).
