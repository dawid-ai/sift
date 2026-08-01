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
import { Button } from "@/components/ui/button";
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
import { KNOWN_PROVIDERS } from "@/lib/ai-provider-catalog";
import { transcriptStageLabel } from "@/lib/transcript-stage-label";

function HomeView() {
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
  const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null);
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
            p.needsKey ? window.sift.aiProviders.keyStatus(p.id) : Promise.resolve(true),
          ),
        ),
      ]);
      if (cancelled) return;
      setProviders(
        KNOWN_PROVIDERS.map((p) =>
          p.id === "custom" && customConfig
            ? { ...p, models: [{ id: customConfig.model, label: customConfig.model }] }
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
    const unsubscribe = window.sift.transcript.onProgress((p: TranscriptProgress) => {
      setTranscriptStage(p.stage);
    });
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
      // Transcript by default: once the video is downloaded, fetch its transcript.
      // Non-fatal — a caption failure (e.g. none available, or a 429) surfaces in the
      // transcript panel, not as a download error.
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
          setExistingItem(lib.find((it) => it.media.sourceUrl === result.sourceUrl) ?? null);
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

  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-8">
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-4xl font-bold tracking-tight"
      >
        {branding.appName}
      </motion.h1>
      <p data-testid="app-version" className="text-sm text-foreground/60">
        v{version}
      </p>
      <p data-testid="db-ready" className="text-sm text-foreground/60">
        {dbReady ? "db-ok" : "db-…"}
      </p>

      <UrlInput onUrl={handleUrl} />

      {loading && (
        <p role="status" className="text-sm text-foreground/60">
          Loading…
        </p>
      )}

      {error && (
        <p
          data-testid="home-error"
          className="max-w-xl text-center text-sm text-red-600 dark:text-red-400"
        >
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
          transcriptStageLabel={transcribing ? transcriptStageLabel(transcriptStage) : null}
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
        <p data-testid="download-done" className="text-sm text-foreground/70">
          Saved to Library
        </p>
      )}

      {transcriptError && (
        <p
          data-testid="transcript-error"
          className="max-w-xl text-center text-sm text-red-600 dark:text-red-400"
        >
          {transcriptError}
        </p>
      )}

      {transcript && <TranscriptPanel transcript={transcript} />}

      {summaryError && (
        <p
          data-testid="summary-error"
          className="max-w-xl text-center text-sm text-red-600 dark:text-red-400"
        >
          {summaryError}
        </p>
      )}

      <SummaryPanel
        text={summaryText}
        summary={summary}
        onExport={() => {
          if (!summary) return Promise.reject(new Error("No summary to export"));
          return window.sift.summarize.export(summary.id);
        }}
      />

      {!metadata && !loading && !error && <Button variant="outline">Get started</Button>}
    </main>
  );
}

export function App() {
  const [view, setView] = useState<View>("home");
  const [focusChannel, setFocusChannel] = useState<ChannelRecord | null>(null);
  const [focusMediaId, setFocusMediaId] = useState<number | null>(null);
  const [openChannelError, setOpenChannelError] = useState<string | null>(null);
  const { state: updateState, dismiss: dismissUpdate } = useUpdates();

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
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar view={view} onNavigate={setView} />
      <div className="flex flex-1 flex-col overflow-auto">
        {openChannelError && (
          <p data-testid="open-channel-error" className="px-4 pt-2 text-sm text-danger">
            {openChannelError}
          </p>
        )}
        {view === "home" && <HomeView />}
        {view === "library" && (
          <LibraryPage
            onOpenChannel={handleOpenChannel}
            focusMediaId={focusMediaId}
            onFocusMediaHandled={() => setFocusMediaId(null)}
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
    </div>
  );
}
