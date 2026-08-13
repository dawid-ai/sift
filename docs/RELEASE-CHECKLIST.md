# Release checklist

## One-time repo setup (owner action — not run by any automation)

Set the repo's description, homepage, and topics so link unfurls and GitHub search
results say something accurate instead of showing a blank/generic card. Requires GitHub
credentials this environment doesn't have — run it yourself:

```bash
gh repo edit dawid-ai/sift \
  --description "Open-source app that turns any video into a searchable, transcribed, summarized library. 100% local." \
  --homepage "https://dawid.ai" \
  --add-topic yt-dlp --add-topic whisper --add-topic transcription --add-topic summarization \
  --add-topic local-first --add-topic electron --add-topic video-downloader --add-topic ollama \
  --add-topic offline --add-topic privacy
```

Then upload a **social preview image**: repo Settings → General → Social preview. This
needs the web UI (no `gh` equivalent) — without one, every link unfurl (Twitter/X,
Slack, Discord, etc.) falls back to a generic GitHub card instead of anything showing
what Sift actually looks like. Use one of the captured screenshots from
[`docs/images/CAPTURE.md`](./images/CAPTURE.md) once they exist, or a purpose-made
1280×640 image — GitHub's recommended social preview size.

Both of these are one-time setup, not part of the per-release flow below.

---

## Per-release

See [`.claude/skills/release-update/SKILL.md`](../.claude/skills/release-update/SKILL.md)
(`/release-update`) for the actual cut-a-release flow: version bump, `UPDATES.md` entry,
commit + tag, the Windows installer build, and — once the tag's installer is published —
bumping the `packaging/winget/` and `packaging/scoop/sift.json` manifests to the new
version/URL/hash before any upstream winget-pkgs or Scoop Extras submission. Notes on
releases already shipped live in [`UPDATES.md`](../UPDATES.md).

The manifests checked into `packaging/` right now pin whatever version they were last
bumped to — treat them as stale until the skill's manifest-bump step has run for the
version you're about to submit upstream.

### Package manager submission status

- **winget — ready.** `packaging/winget/` (3 manifests) validates clean
  (`winget validate`) and is submittable to `microsoft/winget-pkgs` once bumped to the
  version actually being released.
- **Scoop — blocked, do not submit.** `packaging/scoop/sift.json` has no `bin`/
  `shortcuts`/`installer`/`pre_install` stanza, so `scoop install sift` would only cache
  the installer with nothing runnable — no shim, no shortcut, no invocation. The usual
  `Expand-7zipArchive` workaround for electron-builder NSIS apps needs **one-click** NSIS
  packaging; Sift's installer is **assisted** (`nsis.oneClick: false` in
  `apps/desktop/electron-builder.yml`), so that workaround does not apply, and there is
  no established Scoop pattern for assisted-mode NSIS installers
  (see `ScoopInstaller/Extras#1531`, open since 2018). The manifest's `##` field carries
  the same note. **Do not open the Scoop Extras PR until someone has verified a real
  `scoop install sift` produces a working, launchable app on a clean machine** — keep
  bumping `packaging/scoop/sift.json`'s version/hash alongside winget's so it stays
  accurate as a starting point, but treat the actual submission as on hold.
