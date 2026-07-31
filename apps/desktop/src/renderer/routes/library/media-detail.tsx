import { useEffect, useRef, useState } from "react";
import type {
  DownloadOption,
  DownloadProgress,
  DownloadRecord,
  MediaDetail,
  MediaMetadata,
  TranscriptProgress,
} from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { TagEditor } from "@/components/tag-editor";
import { useAiPickers } from "@/lib/use-ai-pickers";
import { appendTimeParam } from "@/lib/transcript-view";
import { MediaPlayer, type MediaPlayerHandle } from "./media-player";
import { TranscriptPanel, type TranscribeMode } from "./transcript-panel";
import { DownloadsPanel } from "./downloads-panel";
import { SummariesPanel } from "./summaries-panel";

type DetailTab = "transcript" | "summary" | "files";

/** mm:ss (or h:mm:ss) — null for missing/zero durations. */
function formatDuration(sec: number | null): string | null {
  if (!sec || sec <= 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

export interface MediaDetailPageProps {
  id: number;
  onBack: () => void;
  onRemoved: () => void;
  onOpenChannel?: (mediaId: number) => void;
}

/** Reads a single media item's downloads, transcripts, and summaries, with per-capture remove
 * (plus per-summary export and per-download reveal-in-folder). */
export function MediaDetailPage({ id, onBack, onRemoved, onOpenChannel }: MediaDetailPageProps) {
  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // Which transcript job this view started ("captions"/"whisper"/null) — so only the clicked
  // button shows the progress label; the other merely disables.
  const [transcribeMode, setTranscribeMode] = useState<TranscribeMode>(null);
  const [transcriptStage, setTranscriptStage] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [tab, setTab] = useState<DetailTab>("transcript");
  const [actionError, setActionError] = useState<string | null>(null);
  // Cache the fetched metadata: transcript.get/summarize.start both need it, and it's a
  // network round-trip (yt-dlp). The component is keyed by media id, so this resets per video.
  const metaRef = useRef<MediaMetadata | null>(null);
  const summaryReqRef = useRef(0);

  const [currentTime, setCurrentTime] = useState(0);
  const playerRef = useRef<MediaPlayerHandle>(null);

  const pickers = useAiPickers();

  useEffect(() => {
    const unsub = window.sift.download.onProgress((p) => {
      if (p.mediaId === id) setProgress(p);
    });
    return unsub;
  }, [id]);

  // Coarse stage progress for this page's own transcript job. The payload carries no
  // mediaId, so this only reflects the truth while `transcribing` (this view's own
  // in-flight request) is true.
  useEffect(() => {
    const unsub = window.sift.transcript.onProgress((p: TranscriptProgress) => {
      setTranscriptStage(p.stage);
    });
    return unsub;
  }, []);

  useEffect(() => {
    let live = true;
    setDetail(null);
    setError(null);
    window.sift.library
      .detail(id)
      .then((d) => {
        if (live) setDetail(d);
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
    };
  }, [id]);

  async function reload() {
    try {
      const d = await window.sift.library.detail(id);
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function ensureMetadata(): Promise<MediaMetadata> {
    if (metaRef.current) return metaRef.current;
    const meta = await window.sift.metadata.fetch(detail!.media.sourceUrl);
    metaRef.current = meta;
    return meta;
  }

  async function startDownload(meta: MediaMetadata, option: DownloadOption) {
    setDownloadingFormat(option.id);
    try {
      await window.sift.download.start({ metadata: meta, option });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloadingFormat(null);
      setProgress(null);
    }
  }

  async function handleRetryDownload(d: DownloadRecord) {
    if (downloadingFormat !== null) return;
    try {
      const meta = await ensureMetadata();
      const option = meta.formats.find((o) => o.id === d.formatId) ?? meta.formats[0];
      if (!option) {
        setError("No downloadable formats found for this video.");
        return;
      }
      await startDownload(meta, option);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDownloadDefault() {
    if (downloadingFormat !== null) return;
    try {
      const meta = await ensureMetadata();
      const option = meta.formats[0];
      if (!option) {
        setError("No downloadable formats found for this video.");
        return;
      }
      await startDownload(meta, option);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Only one transcript job runs at a time (transcript:progress carries no mediaId).
  // transcribeMode records WHICH one, so the panel animates only the button that started it.
  async function handleGetTranscript() {
    if (transcribeMode !== null) return;
    setTranscribeMode("captions");
    setTranscriptStage(null);
    setActionError(null);
    try {
      const meta = await ensureMetadata();
      await window.sift.transcript.get({ metadata: meta });
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setTranscribeMode(null);
      setTranscriptStage(null);
    }
  }

  async function handleRetranscribe() {
    if (transcribeMode !== null) return;
    setTranscribeMode("whisper");
    setTranscriptStage(null);
    setActionError(null);
    try {
      const meta = await ensureMetadata();
      await window.sift.transcript.get({ metadata: meta, force: "whisper" });
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setTranscribeMode(null);
      setTranscriptStage(null);
    }
  }

  async function handleSummarize() {
    const { selectedProviderId, selectedModel, selectedPromptId } = pickers;
    if (summarizing || selectedProviderId === "" || selectedModel === "" || selectedPromptId === "")
      return;
    setSummarizing(true);
    setActionError(null);
    summaryReqRef.current += 1;
    // the detail view doesn't render live streamed tokens — the summary card
    // appears on completion via reload(). requestId is still required by the IPC.
    const requestId = String(summaryReqRef.current);
    try {
      const meta = await ensureMetadata();
      await window.sift.summarize.start({
        metadata: meta,
        providerId: selectedProviderId,
        model: selectedModel,
        promptId: selectedPromptId,
        requestId,
      });
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSummarizing(false);
    }
  }

  async function handleRemove() {
    try {
      await window.sift.library.remove(id);
      onRemoved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRemoveDownload(downloadId: number) {
    try {
      await window.sift.library.removeDownload(downloadId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRemoveTranscript(transcriptId: number) {
    try {
      await window.sift.library.removeTranscript(transcriptId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRemoveSummary(summaryId: number) {
    try {
      await window.sift.library.removeSummary(summaryId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (error) {
    return (
      <main className="flex flex-1 flex-col p-8">
        <Button variant="outline" data-testid="media-detail-back" onClick={onBack}>
          Back to library
        </Button>
        <p data-testid="media-detail-error" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p data-testid="media-detail-loading" className="text-sm text-foreground/60">
          Loading…
        </p>
      </main>
    );
  }

  const { media, transcripts, summaries, downloads } = detail;
  const metaLine = [media.uploader, formatDuration(media.durationSec), media.platformId]
    .filter(Boolean)
    .join(" · ");
  const sourceDisplay = media.sourceUrl.replace(/^https?:\/\/(www\.)?/, "");
  // Channel tracking is keyed on a YouTube channel_id (yt-dlp flat-playlist listing) — it can't
  // list an X/Twitter/etc. profile. Only offer "Open channel" for YouTube media; others use Live URL.
  const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(media.sourceUrl);
  const playable = downloads.find((d) => d.status === "done" && d.filePath) ?? null;
  const hasPlayer = playable !== null;
  // With a local player, clicking a transcript line seeks it; otherwise fall back to
  // opening the source in the browser at that timestamp (the pre-player behavior).
  const seek = (sec: number) => {
    if (hasPlayer) playerRef.current?.seekTo(sec);
    else
      window.sift.library
        .openExternal(appendTimeParam(media.sourceUrl, sec))
        .catch((e) => setActionError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <main data-testid="media-detail" className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" data-testid="media-detail-back" onClick={onBack}>← Library</Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" data-testid="media-detail-open-source"
            onClick={() => void window.sift.library.openExternal(media.sourceUrl)}>Live URL ↗</Button>
          {onOpenChannel && isYouTube && (
            <Button variant="outline" size="sm" data-testid="media-detail-open-channel"
              onClick={() => onOpenChannel(media.id)}>Open channel</Button>
          )}
          {confirmingRemove ? (
            <>
              <Button size="sm" data-testid="media-detail-remove-confirm" onClick={() => void handleRemove()}>Confirm remove</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmingRemove(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="outline" size="sm" data-testid="media-detail-remove"
              onClick={() => setConfirmingRemove(true)}>Remove</Button>
          )}
        </div>
      </div>

      {actionError && (
        <p data-testid="media-detail-action-error" className="text-sm text-red-600 dark:text-red-400">{actionError}</p>
      )}

      {/* Player + info on the left; tabbed content on the right. Stacks on narrow windows. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="flex flex-col gap-5 lg:sticky lg:top-8 lg:self-start">
          <MediaPlayer
            ref={playerRef}
            filePath={playable?.filePath ?? null}
            thumbnailUrl={media.thumbnailUrl}
            onTime={setCurrentTime}
            onDownload={() => void handleDownloadDefault()}
            downloading={downloadingFormat !== null}
          />
          <div>
            <h2 data-testid="media-detail-title" className="text-lg font-semibold leading-snug">{media.title}</h2>
            {metaLine && <p className="mt-1 text-sm text-foreground/55">{metaLine}</p>}
            <button type="button" data-testid="media-detail-source"
              onClick={() => void window.sift.library.openExternal(media.sourceUrl)}
              className="mt-1.5 block max-w-full truncate text-xs text-primary hover:underline" title={media.sourceUrl}>
              {sourceDisplay} ↗
            </button>
          </div>
          <TagEditor mediaId={media.id} tags={detail.tags} onChange={reload} />
        </div>

        <div className="flex min-w-0 flex-col">
          {/* Tab bar */}
          <div className="flex gap-5 border-b border-border">
            {TABS.map((t) => {
              const count = t.key === "transcript" ? transcripts.length : t.key === "summary" ? summaries.length : downloads.length;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  data-testid={`media-detail-tab-${t.key}`}
                  onClick={() => setTab(t.key)}
                  className={`-mb-px flex items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors ${
                    active ? "border-primary text-foreground" : "border-transparent text-foreground/45 hover:text-foreground/75"
                  }`}
                >
                  {t.label}
                  {count > 0 && (
                    <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-primary/15 text-primary" : "bg-foreground/10 text-foreground/50"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-5">
            {tab === "transcript" && (
              <TranscriptPanel
                transcripts={transcripts}
                hasPlayer={hasPlayer}
                currentTime={currentTime}
                transcribeMode={transcribeMode}
                transcriptStage={transcriptStage}
                canRetranscribe={downloads.some((d) => d.status === "done" && d.filePath)}
                onSeek={seek}
                onGetTranscript={() => void handleGetTranscript()}
                onRetranscribe={() => void handleRetranscribe()}
                onRemoveTranscript={(id) => void handleRemoveTranscript(id)}
              />
            )}
            {tab === "summary" && (
              <SummariesPanel
                summaries={summaries}
                transcriptsCount={transcripts.length}
                pickers={pickers}
                summarizing={summarizing}
                onSummarize={() => void handleSummarize()}
                onRemove={(id) => void handleRemoveSummary(id)}
              />
            )}
            {tab === "files" && (
              <DownloadsPanel
                downloads={downloads}
                downloadingFormat={downloadingFormat}
                progress={progress}
                onRetry={(d) => void handleRetryDownload(d)}
                onRemove={(id) => void handleRemoveDownload(id)}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

const TABS: { key: DetailTab; label: string }[] = [
  { key: "transcript", label: "Transcript" },
  { key: "summary", label: "Summary" },
  { key: "files", label: "Files" },
];
