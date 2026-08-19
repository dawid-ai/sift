# FAQ

## Windows says "unknown publisher" — is this safe?

The installer isn't code-signed (a signing certificate costs money and this is an
unfunded solo project), so Windows SmartScreen shows an "unknown publisher" warning on
first run. That's expected, not a sign of anything wrong. Click **More info → Run
anyway**. After that Sift offers you its own updates — it always asks first and never
installs one behind your back — so you should only see this warning once. If it bothers you, read the source — the whole repo is here — or build it
yourself with the commands in [`CONTRIBUTING.md`](../CONTRIBUTING.md).

A `winget` manifest is planned but **not published yet** — check
[`UPDATES.md`](../UPDATES.md) for whether it's landed. Once it is, `winget install` will
skip the browser's own download warning (the "keep/discard this file?" prompt), but that
isn't the same as skipping SmartScreen: the binary itself is still unsigned, so Windows'
reputation-based SmartScreen check can still flag it on first run the same way a direct
download would. Signing (and the reputation SmartScreen builds up over time for a signed,
widely-run binary) is what actually removes the warning, not the install method.

## Why is there a ~466 MB download the first time I transcribe something?

That's the Whisper speech-to-text model (`ggml-small.bin`, a multilingual whisper.cpp
model), fetched once and cached under Sift's app-data folder. It's only needed for
media that has **no existing captions** — if a video already has captions or
auto-captions, Sift pulls those directly from the source and never touches Whisper.
Once the model is downloaded, transcription of caption-less media runs fully offline.

## What does the sign-in browser do, and where do my cookies go?

Some sites (YouTube in particular) throttle or bot-check requests that arrive with no
session, so members-only, age-restricted, or otherwise gated media won't download
without one. Settings → Sign-in browser opens an in-app browser window — you log in to
whatever site you need normally, and Sift reads the resulting session cookies from that
window's own browsing session. Those cookies are handed to yt-dlp locally for
subsequent downloads/transcripts from that site. They're stored on your machine only
(Electron's local session storage) and are never sent anywhere but the site you signed
into. If a site's session goes stale, Sift flags it as "may be signed out" rather than
silently failing — reopen the sign-in browser to refresh it.

## Where do my files go?

By default, downloaded media, transcripts, summaries, and exported documents are saved
under your OS Downloads folder, in a `Sift` subfolder — you can change the base
download location in Settings → Downloads. Transcripts and summaries are auto-written
to disk as `.txt`/`.md` files alongside the video the moment they're created, not just
kept inside the app's database, so they're always plain files you can find, open, or
back up outside Sift. Every video's **Files** tab lists everything generated for it
(transcripts, summaries, exported documents, prompt runs) with a one-click **Open** to
reveal the actual file. Slide frames and OCR data live in Sift's own app-data folder,
not next to the downloaded video.

## Which AI providers work, and what does a summary cost?

Anthropic, OpenAI, a custom OpenAI-compatible endpoint (self-hosted or third-party),
Ollama (runs models locally), and a Claude Code CLI provider that reuses an existing
`claude` login instead of an API key. All keys you supply are encrypted at rest and
never leave your machine except in direct calls to that provider's own API.

Cost depends on transcript length and the model you pick, but a typical video summary
with a hosted API key (Anthropic/OpenAI) runs to a few cents at most — you're paying
the provider directly, at their list price, with no markup from Sift. **Ollama and the
Claude Code CLI provider cost $0** beyond what you already pay for local compute or an
existing Claude subscription.

## Is it legal to download this stuff?

Sift is a local tool — it does exactly what you tell it to, against whatever URL you
give it, using the same public yt-dlp project many other tools are built on. It doesn't
decide what's okay to download; that's on you. Terms of service, copyright, and
platform rules vary by site and by what you plan to do with the result, and this isn't
legal advice. Use Sift in a way that respects the terms of the sites you use it on and
the rights of the people who made the content.
