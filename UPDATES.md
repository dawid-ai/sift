# Updates

## v0.6.0 — 2026-08-19

- **Search actually finds things now.** Typing two words you half-remember works even
  when they aren't next to each other, or you got the order wrong — "queue slower" finds
  the video that says "the queue depth... you got twenty times slower" a sentence apart.
  Before, search only matched an exact run of characters, so that found nothing.
- **Results are ordered by how well they match**, not by what you added last. The video a
  phrase is actually about comes first instead of being buried.
- **New "Search transcripts" switch in the library**, off by default. Leave it off and
  search covers titles and channels. Turn it on to search inside everything that was said
  and every summary. It remembers your choice.
- Search no longer matches inside the middle of a longer word — "cat" stops turning up
  every video that mentions "application". Partial words you're still typing keep working.
- **The queue shows what it's working on.** Finished items used to read as a raw address
  like `/watch?v=Qr7dK2mVzXc`; they now show the video's title. Work in progress also has
  its own colour instead of borrowing the one used for buttons.
- The library table has a **Files** column, and filenames drop the trailing quality tag
  (`[1080p]`) that pushed the useful part of the name off the edge.
- Channels and Subscriptions both show a count, instead of only one of them doing it.
- AI summaries render more readably on both the home and library panels.
- LinkedIn is now in the list of platforms Sift is tested against.

## v0.5.0 — 2026-08-17

- **A new look, everywhere.** Every screen has been redesigned: a warm, lit dark canvas
  instead of flat black, an announced heading on every section, and panels that read as
  layers rather than stacked boxes. The library table is denser and easier to scan —
  the sorted column is marked, numbers line up, and rows separate with a hairline
  instead of stripes.
- **Inter and JetBrains Mono now ship with Sift.** Before, the app asked for them and
  quietly fell back to whatever your system had, so it looked different on every
  machine. They're bundled locally, so nothing is fetched and it still works offline.
- **Tag colours are calmer.** Tags used to take a different hue each, which turned a
  library with thirty tags into a paint chart. They now draw from a small, consistent
  set, and colour is kept for things that mean something — like the transcript language.
- **Tag suggestions are fixed on the details page.** They opened off the bottom of the
  window and were cut off; now they open upward when there's no room below. They also
  follow what you're typing after a comma, so "systems, sq" suggests `sqlite` instead of
  nothing, and picking one keeps the tags you already typed.
- "Add to queue" is now disabled until there's something to add, rather than looking
  ready and doing nothing when you click it.
- Several labels in Settings were too dim to read comfortably and have been brightened
  to meet contrast guidelines.

## v0.4.0 — 2026-08-16

- **Import files you already have.** Drop an audio or video file anywhere on the window
  (or use "choose a file" on Home) and Sift adds it to the library and transcribes it —
  no download step. **Your file is never copied or moved:** Sift points at it where you
  keep it, and removing the library entry leaves the original on disk.
- Imported videos get a **thumbnail pulled from the video itself**, and a progress card
  shows the stage and percentage while a long transcription runs.
- **Prompt packs** — export your prompts as a JSON file, or import someone else's. Sift
  now ships with a creator pack: chapters, title ideas, show notes, a blog draft, and
  clip picks.
- **Timestamped prompts.** Put `{{TIMESTAMPS}}` in a prompt to hand the model a transcript
  with times, so it can cite the moment it's talking about. Summaries can run longer, too.
- **Export any transcript as .srt** subtitles.
- **Outlier badge** on the videos of a channel that beat its median view count.
- **The library table shows more at a glance** — channel and length are now their own
  columns, and the channel name opens its page (inside Sift for YouTube, in your browser
  for everything else). Remove is a trash icon.
- **Slide text recognition works fully offline** — the language data ships with the app
  instead of being downloaded on first use.
- A link Sift can't handle now **says so in plain English** instead of showing a yt-dlp error.
- The video detail page's "Summary" tab is now **"Tools"**.

**Heads-up if you roll back:** builds before v0.4.0 know nothing about imported files, so
removing an imported video from the library on an older build would delete your original.
Don't downgrade while imported files are in your library.

## v0.3.0 — 2026-08-10

- **New look** — a darker, quieter interface: deeper background, coral accents for media
  actions, violet for anything AI, and a compact icon sidebar.
- **Filter the library by channel and platform** with dropdowns next to the search box.
- **Tags now stack.** Click several tags to narrow to videos carrying all of them.
- **Right-click a tag to hide it** — everything except those videos. Hidden tags dim and
  show a red minus.
- **Slides strip scrolls with a normal mouse wheel**, no side-scroll wheel needed.
- **ffmpeg stops re-downloading itself every day.** Sift now follows ffmpeg's stable
  releases instead of its daily development builds. (One last ~80 MB update, then quiet.)

## v0.2.1 — 2026-08-07

- **New app icon** — Sift now has its own teal icon in the taskbar and Start menu.
- **Download page** — the README links a one-click "latest" installer; the app keeps
  updating itself after that.
- **Copy a video's URL** with one click from its detail page (with a "Copied" confirmation).
- The sidebar **Library** button now returns to the list from a video's detail page.
- **Settings** is now organized into tabs: General, Transcription, AI, System.
- **Queue** is clearer: labeled fields, "Video & Audio" / "Best available" wording, and
  tag suggestions as you type.
- **Slides**: a clear **Remove slide region** button when a region is set.

## v0.2.0 — 2026-08-07

- **AI-polished documents** from the Slides tab: turn a talk into a dense knowledge
  document, with slides dropped in where they belong. Pick how it's written — no AI
  (raw), a local model (Ollama), or an external one.
- **Use your Claude subscription** — a new Claude Code CLI provider runs polish and
  summaries through the `claude` command you're already logged into, no API key.
  Pick a default AI provider in Settings.
- **Files tab** on every video: one place listing the documents, transcripts,
  summaries, and prompt runs created for it, each with an **Open** to reveal the file.
- Transcripts and summaries are now **saved to disk** automatically (a .txt / .md
  beside your downloads), not just kept in the app.
- **Save slides…** exports the selected frames as image files at full resolution.
- **Prompt playground** in Settings to tune a prompt against a transcript before using it.
- Whisper transcription now shows a **progress bar**.
- Home tags keep the capitalization you type; the platform badge is tidier.

## v0.1.0 — 2026-08-06

- New **Slides** tab on any downloaded video: pull out the data-bearing frames
  (slides, charts, on-screen text) automatically, or grab the current frame while
  watching.
- Curate what you keep — click to include/exclude, mark a slide region to focus on
  the projected screen, and skip the wide room/camera shots.
- Selected slides fold into the AI summary, and you can export a document
  (Markdown or PDF) that lays the transcript out with each slide dropped in at the
  moment it appears — no AI required.

## v0.0.15 — 2026-08-04

- Sift now installs the tools it needs (yt-dlp, ffmpeg, Deno) automatically on first
  run — no manual setup step.
- Those tools now keep themselves up to date: on launch, an outdated tool updates
  silently in the background (yt-dlp changes often as YouTube does). A toggle in
  Settings → Binaries switches this to notify-only if you'd rather approve each update.
- A small toast shows when a tool is installing/updating or when an update is available.
- Fixed ffmpeg update detection — it previously could never tell that a newer ffmpeg
  build existed. (After this update, ffmpeg may refresh itself once as it moves to the
  new build-date versioning — expected, not a problem.)

## v0.0.14 — 2026-08-03

- Dropdown menus now render dark with readable text (the previous fix didn't cover the
  open menu list on Windows).

## v0.0.13 — 2026-08-03

- Video thumbnails now load reliably: YouTube thumbnails are cached locally (fetched once)
  instead of all hitting the network at once, which could fail to load a whole page of
  thumbnails in a large library. Off-screen thumbnails also load lazily as you scroll.

## v0.0.12 — 2026-08-02

- Fixed dropdown menus (format, provider, filters) and date pickers rendering with a white
  background and unreadable text — they now match the dark theme.

## v0.0.11 — 2026-08-02

- Library pagination controls now stay pinned at the bottom, with no empty gap beneath them on
  shorter pages. The list scrolls on its own while the search and filters stay in view.

## v0.0.10 — 2026-08-02

- When you paste a URL that's already in your library, the preview now shows what you already
  have — badges for the downloaded video, its transcript, and any summaries.
- Downloading an already-captured video now asks for confirmation first, so you don't
  overwrite an existing file by accident.

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
