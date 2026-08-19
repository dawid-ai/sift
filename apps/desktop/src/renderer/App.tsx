import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { branding } from "@sift/core";
import type {
  AiProviderInfo,
  ChannelRecord,
  DownloadOption,
  DownloadProgress,
  MediaListItem,
  MediaMetadata,
  PromptInfo,
  SummaryRecord,
  TranscriptProgress,
  TranscriptRecord,
} from "@sift/ipc-contract";
import { Sidebar, type View } from "@/components/app-shell";
import { SettingsPage } from "@/routes/settings/settings-page";
import { UrlInput } from "@/routes/home/url-input";
import { PreviewCard } from "@/routes/home/preview-card";
import { TranscriptPanel } from "@/routes/home/transcript-panel";
import { SummaryPanel } from "@/routes/home/summary-panel";
import { LibraryPage } from "@/routes/library/library-page";
import { QueuePage } from "@/routes/queue/queue-page";
import { ChannelsPage } from "@/routes/channels/channels-page";
import { useUpdates } from "@/routes/updates/use-updates";
import { UpdateToast } from "@/routes/updates/update-toast";
import { useBinaryUpdates } from "@/routes/updates/use-binary-updates";
import { BinaryUpdateToast } from "@/routes/updates/binary-update-toast";
import { KNOWN_PROVIDERS } from "@/lib/ai-provider-catalog";
import { transcriptStageLabel } from "@/lib/transcript-stage-label";
import { DropOverlay } from "@/components/drop-overlay";
import { Badge } from "@/components/ui/badge";
import { ChipDot } from "@/components/tag-chip";
import { useFileImport } from "@/lib/use-file-import";
import { cn } from "@/lib/utils";

/**
 * The one inline-alert shell on this view. Four hand-rolled copies of "tinted danger block"
 * had already drifted apart by an alpha step each; they are one string now, matching the
 * `danger` pill tone so an error message and an error badge are visibly the same claim.
 */
const ALERT_DANGER =
  "rounded-xl border border-danger/30 bg-danger/14 px-4 py-3 text-sm text-danger shadow-bevel";

function HomeView({
  onPickFiles,
  busy,
  onOpenLibrary,
}: {
  onPickFiles: () => void;
  busy: boolean;
  /** Same route change the rail's Library button makes — see the download-done row below. */
  onOpenLibrary: () => void;
}) {
  const [version, setVersion] = useState("…");
  const [dbReady, setDbReady] = useState(false);
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
  const [existingItem, setExistingItem] = useState<MediaListItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloadDone, setDownloadDone] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptStage, setTranscriptStage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptRecord | null>(null);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [summary, setSummary] = useState<SummaryRecord | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [providers, setProviders] = useState<AiProviderInfo[]>(KNOWN_PROVIDERS);
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(
    null,
  );
  const [prompts, setPrompts] = useState<PromptInfo[]>([]);
  const requestIdRef = useRef(0);
  const transcribeRequestIdRef = useRef(0);
  // requestId is a per-HomeView incrementing counter (not a UUID) — enough to
  // ignore stale streams; a real id space isn't needed for one active summary.
  const summaryRequestIdRef = useRef(0);

  useEffect(() => {
    window.sift.app.getVersion().then(setVersion);
    window.sift.db.isReady().then(setDbReady);
  }, []);

  // The picker is driven by the static KNOWN_PROVIDERS list (see ai-provider-catalog),
  // not `aiProviders.list()` — a keyed provider isn't registered until its key is
  // set, so `list()` alone can't show unkeyed providers for the user to pick/key.
  useEffect(() => {
    let cancelled = false;
    async function loadProviders() {
      const [customConfig, keyFlags] = await Promise.all([
        window.sift.aiProviders.getCustomConfig(),
        Promise.all(
          KNOWN_PROVIDERS.map((p) =>
            p.needsKey
              ? window.sift.aiProviders.keyStatus(p.id)
              : Promise.resolve(true),
          ),
        ),
      ]);
      if (cancelled) return;
      setProviders(
        KNOWN_PROVIDERS.map((p) =>
          p.id === "custom" && customConfig
            ? {
                ...p,
                models: [{ id: customConfig.model, label: customConfig.model }],
              }
            : p,
        ),
      );
      const readyId = KNOWN_PROVIDERS.find((_, i) => keyFlags[i])?.id ?? null;
      setDefaultProviderId(readyId);
    }
    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refetchPrompts = () => {
      window.sift.prompts.list().then(setPrompts);
    };
    refetchPrompts();
    window.addEventListener("focus", refetchPrompts);
    return () => window.removeEventListener("focus", refetchPrompts);
  }, []);

  useEffect(() => {
    const unsubscribe = window.sift.download.onProgress((p) => {
      setProgress(p);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = window.sift.summarize.onToken((t) => {
      if (t.requestId !== String(summaryRequestIdRef.current)) return;
      if (t.done) return;
      setSummaryText((prev) => prev + t.delta);
    });
    return unsubscribe;
  }, []);

  // Coarse stage progress ("extracting-audio", "transcribing", ...) for the in-flight
  // transcript job; only meaningful while `transcribing` is true (cleared on settle).
  useEffect(() => {
    const unsubscribe = window.sift.transcript.onProgress(
      (p: TranscriptProgress) => {
        setTranscriptStage(p.stage);
      },
    );
    return unsubscribe;
  }, []);

  // one active download at a time; concurrency/queue is Phase 7.
  const handleDownload = useCallback(
    async (option: DownloadOption, tags: string[]) => {
      if (!metadata) return;
      setDownloading(true);
      setDownloadDone(false);
      setError(null);
      try {
        await window.sift.download.start({ metadata, option, tags });
        setDownloadDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      } finally {
        setDownloading(false);
        setProgress(null);
      }
      // Transcript after download (Settings → "Get transcript after download", default on):
      // fetch the transcript now that the video is on disk (so Whisper can process a
      // caption-less video). Non-fatal — a caption failure (none available, or a 429)
      // surfaces in the transcript panel, not as a download error.
      if (!(await window.sift.transcript.getAutoDownload())) return;
      transcribeRequestIdRef.current += 1;
      const rid = transcribeRequestIdRef.current;
      setTranscribing(true);
      setTranscriptStage(null);
      setTranscriptError(null);
      try {
        const t = await window.sift.transcript.get({ metadata });
        if (rid === transcribeRequestIdRef.current) setTranscript(t);
      } catch (err) {
        if (rid === transcribeRequestIdRef.current)
          setTranscriptError(err instanceof Error ? err.message : String(err));
      } finally {
        if (rid === transcribeRequestIdRef.current) {
          setTranscribing(false);
          setTranscriptStage(null);
        }
      }
    },
    [metadata],
  );

  const handleTranscribe = useCallback(async () => {
    if (!metadata) return;
    transcribeRequestIdRef.current += 1;
    const rid = transcribeRequestIdRef.current;

    setTranscribing(true);
    setTranscriptStage(null);
    setTranscriptError(null);
    try {
      const t = await window.sift.transcript.get({ metadata });
      if (rid === transcribeRequestIdRef.current) setTranscript(t);
    } catch (err) {
      if (rid === transcribeRequestIdRef.current)
        setTranscriptError(err instanceof Error ? err.message : String(err));
    } finally {
      if (rid === transcribeRequestIdRef.current) {
        setTranscribing(false);
        setTranscriptStage(null);
      }
    }
  }, [metadata]);

  const handleSummarize = useCallback(
    async (providerId: string, model: string, promptId: number) => {
      if (!metadata) return;
      summaryRequestIdRef.current += 1;
      const rid = String(summaryRequestIdRef.current);

      setSummaryText("");
      setSummary(null);
      setSummaryError(null);
      setSummarizing(true);
      try {
        const rec = await window.sift.summarize.start({
          metadata,
          providerId,
          model,
          promptId,
          requestId: rid,
        });
        if (rid === String(summaryRequestIdRef.current)) setSummary(rec);
      } catch (err) {
        if (rid === String(summaryRequestIdRef.current))
          setSummaryError(err instanceof Error ? err.message : String(err));
      } finally {
        if (rid === String(summaryRequestIdRef.current)) setSummarizing(false);
      }
    },
    [metadata],
  );

  const handleUrl = useCallback((url: string) => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    setDownloadDone(false);
    transcribeRequestIdRef.current += 1;
    setTranscribing(false);
    setTranscriptStage(null);
    setTranscript(null);
    setTranscriptError(null);
    summaryRequestIdRef.current += 1;
    setSummarizing(false);
    setSummaryText("");
    setSummary(null);
    setSummaryError(null);

    setExistingItem(null);

    if (!url) {
      setLoading(false);
      setError(null);
      setMetadata(null);
      return;
    }

    setLoading(true);
    setError(null);
    window.sift.metadata
      .fetch(url)
      .then(async (result) => {
        if (requestIdRef.current !== requestId) return;
        setMetadata(result);
        try {
          const lib = await window.sift.library.list();
          if (requestIdRef.current !== requestId) return;
          setExistingItem(
            lib.find((it) => it.media.sourceUrl === result.sourceUrl) ?? null,
          );
        } catch {
          // Lookup is a non-blocking convenience — a failure here must not affect the preview.
        }
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setMetadata(null);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setLoading(false);
      });
  }, []);

  // Resting state: nothing has been pasted, nothing is in flight, nothing failed. The layout
  // has a vertical strategy only in this state — see the note on <main> below.
  const resting = !metadata && !loading && !error;

  return (
    <main
      className={cn(
        "flex flex-1 flex-col items-center px-6 py-9 sm:px-10",
        // At rest the column ended around y≈440 of a 900px window and the remaining ~460px —
        // over half the app — was unbroken black with nothing anchoring it, which reads as a
        // window that failed to finish painting. Centring the column gives the empty state a
        // floor and a ceiling. It reverts to top-aligned the instant a preview card mounts,
        // so the page never centres content that is about to grow past the viewport.
        resting && "justify-center",
      )}
    >
      {/* Content is held in a centred column — it never sprawls edge to edge. */}
      <div className="flex w-full max-w-3xl flex-col gap-5">
        {/* THE HEADER YIELDS TO THE WORK.

            It used to be pinned, whole, above every step of the flow: 'HOME', 'Sift' at
            32px/700 in pure white, a version pill and a two-sentence product description —
            all four still there once the screen's subject was a specific video. The largest,
            brightest type on a screen about someone's media was the app's own name, 285px
            above and one contrast rung over that media's title.

            So the header has two states, and the trigger is `metadata`, i.e. "is there
            something on this screen more important than the product name yet". At rest the
            route IS the product and it says so — the 32px rung is spent on the app's name
            because at that moment the app IS the subject. Once metadata resolves this
            collapses to a breadcrumb rung and the top of the ramp on this screen becomes the
            preview card's 22px title, which is what the user is actually working on.

            The description goes first because it is the one block here that carries no state:
            it is marketing copy, read once, re-served on every render, and it can never say
            anything different. The version pill goes with it — a build number is not part of
            a job in flight, and Settings → System prints it as "Build v…". */}
        <motion.header
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <p className="eyebrow">HOME</p>
          {metadata ? (
            /* Collapsed. The <h1> stays, and stays the brand name (smoke.spec asserts it, and
               brand strings come from @sift/core, never a literal) — it just stops being the
               loudest object on the page. 15px/600 on the secondary rung reads as the route
               line it now is, sitting under its own eyebrow. */
            <h1 className="mt-1.5 text-[15px] font-semibold leading-snug text-fg-secondary">
              {branding.appName}
            </h1>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-[32px] font-bold leading-none tracking-tight text-foreground">
                  {branding.appName}
                </h1>
                {/* The version marker is chrome, so it takes the shared `neutral` pill rather
                    than a fifth hand-rolled one. */}
                <Badge
                  data-testid="app-version"
                  variant="neutral"
                  className="tabular-nums"
                >
                  v{version}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Save videos from any supported site, write down every word, and
                get a summary. It all stays on this machine.
              </p>
            </>
          )}
        </motion.header>

        <p data-testid="db-ready" className="sr-only">
          {dbReady ? "db-ok" : "db-…"}
        </p>

        {/* The lit rim is STATEFUL, not positional: it marks the step the user is on, and
            exactly one panel per render may wear it. While the field is empty this card is
            the whole job, so it is the hero. Once metadata is on screen the link is resolved
            and this card is spent — leaving it the brightest, warm-glowing surface on the
            page pulled the eye back to the input the user had finished with, while the card
            holding the title, the format picker and the primary CTA got the dimmest rim of
            the three. It steps down to `.panel` here; the preview card takes the light. */}
        <section className={cn(metadata ? "panel" : "panel-lit", "px-6 py-5")}>
          <UrlInput onUrl={handleUrl} />

          <p
            data-testid="home-drop-hint"
            className="mt-3.5 text-sm text-muted-foreground"
          >
            …or drop a video or audio file anywhere —{" "}
            <button
              type="button"
              data-testid="home-pick-file"
              onClick={onPickFiles}
              disabled={busy}
              // Not coral. This is a secondary path to the same job the field above already
              // does; it sat one line under the section label and 40px from the primary CTA,
              // and three coral things inside one card is how the CTA stopped reading as the
              // primary. An underlined link is affordance enough.
              className="rounded-sm font-medium text-foreground underline decoration-foreground/35 underline-offset-[3px] transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:text-fg-disabled disabled:decoration-transparent"
            >
              choose a file
            </button>
          </p>

          {/* Nothing follows the drop-a-file line at rest. A status slot used to live here and
              it restated the field's own placeholder — "Paste a video, playlist or channel
              URL…" in the input, and 220px below it, under a hairline rule set as if it were
              a status line, "Paste a video, playlist, or channel URL above to fetch it."
              The same sentence twice, differing by an Oxford comma, so the card ended on an
              empty restatement of itself. Loading and error are the real states and they
              render below the card. */}
        </section>

        {loading && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_1px_hsl(var(--primary)/0.7)]"
            />
            Loading…
          </p>
        )}

        {error && (
          <p data-testid="home-error" className={ALERT_DANGER}>
            {error}
          </p>
        )}

        {!loading && metadata && (
          <PreviewCard
            metadata={metadata}
            existing={existingItem}
            onDownload={(option, tags) => void handleDownload(option, tags)}
            downloading={downloading}
            progress={progress}
            onTranscribe={() => void handleTranscribe()}
            transcribing={transcribing}
            transcriptStageLabel={
              transcribing ? transcriptStageLabel(transcriptStage) : null
            }
            onSummarize={(providerId, model, promptId) =>
              void handleSummarize(providerId, model, promptId)
            }
            summarizing={summarizing}
            transcript={transcript}
            providers={providers}
            defaultProviderId={defaultProviderId}
            prompts={prompts}
          />
        )}

        {downloadDone && (
          // Docked into a surface. It used to be the only element in the column that wasn't a
          // card: a bare pill floating in the 22px gutter between the Capture card and the
          // Transcript card, flush with their outer edge rather than their content edge and
          // attached to neither — it read as a toast that had failed to dismiss. It is a row
          // on the card plane now, and it holds a claim and the one control that acts on that
          // claim, which is what earns a row its height (see the note on the link below).
          <div className="panel flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3.5">
            {/* ONE status shell on this route, and this is it: the shared neutral pill with a
                hued dot. It used to be the tinted `success` variant — green fill, green
                border, green label — while "Tested" in the preview header 200px above it was
                the neutral shell with a green dot and a white label. Same green dot in both,
                meaning "good" in both, then disagreeing about whether the pill around it is
                neutral or tinted: two chip languages for one semantic, on one screen, at the
                same instant (the preview card is still mounted when this row appears).

                The neutral shell wins because it is the one every other pill on the route
                already wears, so the dot alone carries the hue — which is also what keeps a
                *confirmation* from out-shouting the transcript and summary panels that land
                underneath it seconds later. One size up (h-7/13px) because a confirmation is
                read once rather than scanned in a row of metadata. */}
            <Badge
              data-testid="download-done"
              variant="neutral"
              className="h-7 w-fit px-3 text-[13px] text-foreground/90"
            >
              <ChipDot
                color="hsl(var(--success))"
                halo="hsl(var(--success) / 0.22)"
              />
              Saved to Library
            </Badge>
            {/* What the row lost and what it gained, because the trade is the point.
                It used to reprint `metadata.title` here — the same string the preview card
                sets at 22px roughly 500px higher up, still mounted, never scrolled off when
                this row appears. One fact, two prints, one viewport, and the second print was
                the smaller and dimmer of the two, so it added nothing but a line of height.

                What the row could not do was the thing it had just claimed: it announced that
                the file is in the Library and then offered no way to get there. That is the
                affordance now — the same route change the rail's Library button makes, offered
                where the claim is made. `role="link"`, because the result of pressing it is
                "you are now looking at somewhere else" rather than anything happening to the
                media. (That also keeps it out of `getByRole("button", { name: "Library" })`,
                which ~17 specs use to click the rail while Home is still mounted: the matcher
                is a case-insensitive SUBSTRING match, so a *button* named "Open in Library"
                on this route would make every one of them ambiguous.)

                Quiet by construction: 13px on the secondary rung, no shell, no coral. A
                confirmation's follow-on is not the primary action of the screen — the CTA in
                the card above it still is. */}
            <button
              type="button"
              role="link"
              data-testid="download-open-library"
              onClick={onOpenLibrary}
              className="ml-auto rounded-sm text-[13px] font-medium text-fg-secondary transition-colors duration-150 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Open in Library <span aria-hidden>→</span>
            </button>
          </div>
        )}

        {transcriptError && (
          <p data-testid="transcript-error" className={ALERT_DANGER}>
            {transcriptError}
          </p>
        )}

        {transcript && <TranscriptPanel transcript={transcript} />}

        {summaryError && (
          <p data-testid="summary-error" className={ALERT_DANGER}>
            {summaryError}
          </p>
        )}

        <SummaryPanel
          text={summaryText}
          summary={summary}
          onExport={() => {
            if (!summary)
              return Promise.reject(new Error("No summary to export"));
            return window.sift.summarize.export(summary.id);
          }}
        />
      </div>
    </main>
  );
}

export function App() {
  const [view, setView] = useState<View>("home");
  const [focusChannel, setFocusChannel] = useState<ChannelRecord | null>(null);
  const [focusMediaId, setFocusMediaId] = useState<number | null>(null);
  // Bumped each time the Library nav is clicked, so LibraryPage closes any open detail
  // and returns to the list — even when already on the library view (a no-op setView).
  const [libraryHome, setLibraryHome] = useState(0);
  const [openChannelError, setOpenChannelError] = useState<string | null>(null);

  const handleNavigate = useCallback((v: View) => {
    if (v === "library") setLibraryHome((n) => n + 1);
    setView(v);
  }, []);
  // A finished import lands the user on the library list, which is also how the list
  // refreshes — same path the Library nav click takes.
  const fileImport = useFileImport(
    useCallback(() => handleNavigate("library"), [handleNavigate]),
  );
  const { state: updateState, dismiss: dismissUpdate } = useUpdates();
  const { state: binaryUpdateState, dismiss: dismissBinaryUpdate } =
    useBinaryUpdates();

  // Jumps from a channel's "Downloaded from this channel" list to that video's in-app detail.
  const handleOpenMedia = useCallback((mediaId: number) => {
    setFocusMediaId(mediaId);
    setView("library");
  }, []);

  // Jumps from a Library media item to its source channel. A resolve failure (no channel
  // link on the video, or a bot-check) surfaces inline instead of silently no-op'ing.
  const handleOpenChannel = useCallback(async (mediaId: number) => {
    setOpenChannelError(null);
    try {
      const ch = await window.sift.channels.openForMedia(mediaId);
      setFocusChannel(ch);
      setView("channels");
    } catch (err) {
      setOpenChannelError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return (
    // .app-canvas paints the whole atmosphere once on a non-scrolling root; the content
    // pane below is the only thing that scrolls, so the gradients are never repainted.
    <div className="app-canvas flex h-screen overflow-hidden">
      <Sidebar view={view} onNavigate={handleNavigate} />
      {/* THE PANE SCROLLS FOR EXACTLY ONE ROUTE, so exactly one route reserves the gutter.

          Home lets its column grow past the viewport (a preview card, then a transcript panel,
          then a summary) and scrolls *this* box. It needs `scrollbar-gutter: stable`: without
          it the whole content column jogged 4–5px sideways the instant a preview card was
          added — every element on the screen moved because a scrollbar had appeared. (The
          gutter is only honoured for classic, non-overlay scrollbars, which is what the
          ::-webkit-scrollbar rules in globals.css keep us on.)

          Every other route is a full-height frame pinned to this box with `min-h-0 flex-1`
          and owns its own scroller — settings-page's frame is `overflow-hidden`; queue,
          channels and library each declare their own `overflow-y-auto [scrollbar-gutter:
          stable]` inside. For those the pane can never overflow, so an unconditional
          `overflow-y-scroll` reserved 10px that nothing could ever use, and on settings that
          dead strip was *visible*: the right rail is docked chrome (border-l + tint, full
          window height) and it stopped 10px short of the window edge, with page background
          showing through the whole 900px. There is no shift to trade away here — a box that
          cannot scroll cannot gain a scrollbar — so the routes that scroll keep the
          reservation and the routes that don't stop paying for it. `auto` rather than
          `hidden` so an unexpected overflow scrolls instead of being clipped away. */}
      <div
        className={cn(
          "relative flex min-w-0 flex-1 flex-col overflow-x-auto",
          view === "home"
            ? "overflow-y-scroll [scrollbar-gutter:stable]"
            : "overflow-y-auto",
        )}
      >
        <DropOverlay
          dragging={fileImport.dragging}
          busy={fileImport.busy}
          error={fileImport.error}
        />
        {openChannelError && (
          <p
            data-testid="open-channel-error"
            className={`mx-6 mt-4 ${ALERT_DANGER}`}
          >
            {openChannelError}
          </p>
        )}
        {view === "home" && (
          <HomeView
            onPickFiles={() => void fileImport.pick()}
            busy={fileImport.busy !== null}
            onOpenLibrary={() => handleNavigate("library")}
          />
        )}
        {view === "library" && (
          <LibraryPage
            onOpenChannel={handleOpenChannel}
            focusMediaId={focusMediaId}
            onFocusMediaHandled={() => setFocusMediaId(null)}
            homeSignal={libraryHome}
          />
        )}
        {view === "queue" && <QueuePage />}
        {view === "channels" && (
          <ChannelsPage
            focusChannel={focusChannel}
            onFocusHandled={() => setFocusChannel(null)}
            onOpenMedia={handleOpenMedia}
          />
        )}
        {view === "settings" && <SettingsPage updateState={updateState} />}
      </div>
      <UpdateToast state={updateState} onDismiss={dismissUpdate} />
      <BinaryUpdateToast
        state={binaryUpdateState}
        onDismiss={dismissBinaryUpdate}
      />
    </div>
  );
}
