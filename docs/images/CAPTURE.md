# Screenshot / GIF capture checklist

`slides.png`, `library.png`, `transcript.png`, and `summary.png` are in place and embedded
in the README. They are downscaled from the marketing capture (`SIFT_WEB_SHOTS=1`, which
lives in the `sift-web` checkout under `web/`), which drives the real app against a seeded
demo library — invented channel and talk names, real posters, real slide art. Regenerate
them the same way rather than by hand, so the set stays consistent:

```sh
# from web/, per that repo's README: SIFT_WEB_SHOTS=1 playwright test e2e/web-shots.spec.ts
# then downscale the four the README uses to 1440px wide, 8-bit palette, < 500 KB each.
```

Still missing: the GIF (section 5 below). The rest of this file is the original brief for
capturing these by hand from a real library, kept because a hand-captured set from real
content is still the better version if you have one.

**Before you start:** run `pnpm dev` against a library that has real content — at least
one video downloaded with a transcript, one with an AI summary, and one lecture/talk-style
video run through Slides → Extract slides so there are real extracted frames to show.
Placeholder/empty states are not acceptable for any of these.

**Window size:** resize the Sift window to exactly **1440×900** before capturing, and
keep it at that size for all four screenshots and the GIF. Consistent sizing means they
can later be cropped into a shared layout without one image looking zoomed relative to
the others. On Windows, snap the window then drag a corner to the exact size, or use a
sizing tool — don't eyeball it.

**Format:** PNG for the four stills, keep each **under ~500 KB** (re-export/compress if
a raw capture comes in larger — a screenshotted UI compresses easily, there's no reason
to ship an uncompressed multi-MB PNG). GIF for the fifth, see its own section below.

---

## 1. `slides.png` — lead image, capture this one first

This is the differentiator — no competitor in either the yt-dlp-GUI or local-Whisper
category does this, so it should look like the most complete, most "finished" screen of
the five.

**What must be on screen:** the Slides tab of a real downloaded lecture/talk video, with
several extracted frames visible in the strip, at least 2-3 of them selected/included,
and ideally the player showing the current slide alongside its timestamp. If you have a
finished exported PDF instead of the live Slides tab open, that's an acceptable
substitute per the brief — pick whichever looks more compelling once you see both.

**Save as:** `docs/images/slides.png`

## 2. `library.png` — populated library, tiles view

**What must be on screen:** the Library route in **tiles view** (not the table view —
tiles is the more visual, more screenshot-friendly layout), with enough real videos in
it that it reads as an actual library, not an empty or near-empty state. Real thumbnails,
real titles, a mix of channels/platforms if you have them. If tags or the
channel/platform filter dropdowns are visible in the shot, that's a bonus — it shows
more of the library feature surface in one image.

**Save as:** `docs/images/library.png`

## 3. `detail.png` — media detail with synced transcript

**What must be on screen:** a video's detail page with the in-app player and the
Transcript tab open beside it, showing real transcript segments (not an empty or
error state). If you can time the capture so a segment near the player's current
timestamp is visibly highlighted/active, that best demonstrates the "synced,
click-to-seek" behavior — but a static transcript list is acceptable if not.

**Save as:** `docs/images/detail.png`

## 4. `settings-ai.png` — AI provider list (proof of BYO-key)

**What must be on screen:** Settings → AI, with the provider list visible — Anthropic,
OpenAI, Ollama, Custom, and the Claude Code CLI provider should all be visible in the
same shot if the layout allows it, since the point of this image is showing the
"bring your own key, including a local/free option" model at a glance. Ollama being
visibly present (and ideally shown as available/keyless) matters most — it's the proof
this isn't a subscription-gated tool.

**Save as:** `docs/images/settings-ai.png`

## 5. `demo.gif` — the core loop

**What must be on screen:** paste a URL on Home → click Download → download completes →
click "Get transcript" → transcript panel appears with real segments. 10-20 seconds
total, looping is fine. This is the one moving image — it should read clearly at
README width (compress/resize so it doesn't balloon in file size; a few MB is fine for
a GIF, tens of MB is not).

**Save as:** `docs/images/demo.gif`

---

## Once the files exist

Add the image embeds to `README.md`, replacing the HTML comment
`<!-- Screenshots/GIF go here once captured — see docs/images/CAPTURE.md. -->` that
currently sits right after the opening paragraph, above the Download section and the
Features list. Suggested block (adjust order/sizing to taste once you see the real
images side by side):

```markdown
![Slides: extracted frames + document export](docs/images/slides.png)

![Sift in action: paste a URL, download, transcribe](docs/images/demo.gif)

![Library](docs/images/library.png) ![Media detail with synced transcript](docs/images/detail.png)

![Settings — AI providers](docs/images/settings-ai.png)
```

This is a clean insertion, not a rewrite — nothing else in the README needs to change
when these land.
