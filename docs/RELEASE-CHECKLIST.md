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
commit + tag, and the Windows installer build. Notes on releases already shipped live in
[`UPDATES.md`](../UPDATES.md).
