import { useEffect, useRef, useState } from "react";
import type {
  DownloadOption,
  DownloadProgress,
  DownloadRecord,
  FrameCrop,
  FrameProgress,
  FrameExportProgress,
  FrameRecord,
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
import { FilesPanel } from "./files-panel";
import { SummariesPanel } from "./summaries-panel";
import { SlidesPanel } from "./slides-panel";

type DetailTab = "transcript" | "summary" | "slides" | "files";

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
  const [transcriptRatio, setTranscriptRatio] = useState<number | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [frames, setFrames] = useState<FrameRecord[]>([]);
  const [extractingFrames, setExtractingFrames] = useState(false);
  const [capturingFrame, setCapturingFrame] = useState(false);
  const [frameStage, setFrameStage] = useState<FrameProgress | null>(null);
  // Whether clicking a slide also starts playback. Off by default; remembered across sessions.
  const [autoplayOnClick, setAutoplayOnClick] = useState(
    () => localStorage.getItem("sift.slidesAutoplay") === "1",
  );
  const [crop, setCrop] = useState<FrameCrop | null>(null);
  const [cropEditing, setCropEditing] = useState(false);
  const [exportingDoc, setExportingDoc] = useState(false);
  const [documentPath, setDocumentPath] = useState<string | null>(null);
  const [exportStage, setExportStage] = useState<FrameExportProgress | null>(null);
  // Document AI-polish selection ("" provider = No AI / raw). Separate from the summary picker.
  const [polishProviderId, setPolishProviderId] = useState("");
  const [polishModel, setPolishModel] = useState("");
  // Empty = off; otherwise an Ollama vision model that AI-filters non-slide frames. Remembered.
  const [classifierModel, setClassifierModel] = useState(
    () => localStorage.getItem("sift.slideClassifier") ?? "",
  );
  const [fullScreenOnly, setFullScreenOnly] = useState(
    () => localStorage.getItem("sift.slidesFullScreenOnly") === "1",
  );
  const [tab, setTab] = useState<DetailTab>("transcript");
  const [actionError, setActionError] = useState<string | null>(null);
  // Cache the fetched metadata: transcript.get/summarize.start both need it, and it's a
  // network round-trip (yt-dlp). The component is keyed by media id, so this resets per video.
  const metaRef = useRef<MediaMetadata | null>(null);
  const summaryReqRef = useRef(0);

  const [currentTime, setCurrentTime] = useState(0);
  const playerRef = useRef<MediaPlayerHandle>(null);

  const pickers = useAiPickers();

  // Models for the chosen document-polish provider; keep the selected model valid.
  const polishModels = pickers.providers.find((p) => p.id === polishProviderId)?.models ?? [];
  useEffect(() => {
    if (!polishProviderId) {
      setPolishModel("");
      return;
    }
    setPolishModel((prev) => (polishModels.some((m) => m.id === prev) ? prev : (polishModels[0]?.id ?? "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polishProviderId, pickers.providers]);

  useEffect(() => window.sift.frames.onExportProgress((p) => setExportStage(p)), []);

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
      setTranscriptRatio(p.ratio);
    });
    return unsub;
  }, []);

  // Frames + crop aren't part of MediaDetail — load them separately per media id.
  useEffect(() => {
    let live = true;
    setFrames([]);
    setCrop(null);
    setCropEditing(false);
    window.sift.frames
      .list(id)
      .then((f) => {
        if (live) setFrames(f);
      })
      .catch(() => {
        /* absent frames are not an error; the panel just shows its empty state */
      });
    window.sift.frames
      .getCrop(id)
      .then((c) => {
        if (live) setCrop(c);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);

  // Coarse extraction progress (no mediaId in the payload — reflects truth only while
  // this view's own `extractingFrames` run is in flight, same caveat as transcript above).
  useEffect(() => {
    const unsub = window.sift.frames.onProgress((p: FrameProgress) => {
      setFrameStage(p);
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
    setTranscriptRatio(null);
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
      setTranscriptRatio(null);
    }
  }

  async function handleRetranscribe() {
    if (transcribeMode !== null) return;
    setTranscribeMode("whisper");
    setTranscriptStage(null);
    setTranscriptRatio(null);
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
      setTranscriptRatio(null);
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

  async function handleExtractFrames() {
    if (extractingFrames) return;
    setExtractingFrames(true);
    setFrameStage(null);
    setActionError(null);
    try {
      await window.sift.frames.extract(id, {
        classifierModel: classifierModel || undefined,
        fullScreenOnly,
      });
      // Re-list rather than trust the return: extract preserves manual captures, so the
      // full ordered set (auto + manual) only comes from a fresh list.
      setFrames(await window.sift.frames.list(id));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setExtractingFrames(false);
      setFrameStage(null);
    }
  }

  async function handleCaptureFrame() {
    if (capturingFrame || !hasPlayer) return;
    setCapturingFrame(true);
    setActionError(null);
    try {
      const tsMs = Math.round((playerRef.current?.getCurrentTime() ?? 0) * 1000);
      await window.sift.frames.capture(id, tsMs);
      setFrames(await window.sift.frames.list(id));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setCapturingFrame(false);
    }
  }

  async function handleToggleInclude(frameId: number, included: boolean) {
    setFrames((fs) => fs.map((f) => (f.id === frameId ? { ...f, included } : f))); // optimistic
    try {
      await window.sift.frames.setIncluded(frameId, included);
    } catch (e) {
      setFrames((fs) => fs.map((f) => (f.id === frameId ? { ...f, included: !included } : f)));
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  function toggleAutoplay() {
    setAutoplayOnClick((v) => {
      const next = !v;
      localStorage.setItem("sift.slidesAutoplay", next ? "1" : "0");
      return next;
    });
  }

  function changeClassifier(model: string) {
    setClassifierModel(model);
    localStorage.setItem("sift.slideClassifier", model);
  }

  function toggleFullScreenOnly() {
    setFullScreenOnly((v) => {
      const next = !v;
      localStorage.setItem("sift.slidesFullScreenOnly", next ? "1" : "0");
      return next;
    });
  }

  function handleCropDraw(c: FrameCrop) {
    setCrop(c);
    setCropEditing(false);
    window.sift.frames.setCrop(id, c).catch((e) => setActionError(e instanceof Error ? e.message : String(e)));
  }

  function handleClearCrop() {
    setCrop(null);
    setCropEditing(false);
    window.sift.frames.setCrop(id, null).catch((e) => setActionError(e instanceof Error ? e.message : String(e)));
  }

  async function handleSaveSlides() {
    setActionError(null);
    try {
      const res = await window.sift.frames.saveSelected(id);
      if (res) window.sift.library.reveal(res.dir);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleExportDocument(format: "md" | "pdf") {
    if (exportingDoc) return;
    setExportingDoc(true);
    setExportStage(null);
    setActionError(null);
    const polish = polishProviderId && polishModel ? { providerId: polishProviderId, model: polishModel } : undefined;
    try {
      setDocumentPath(await window.sift.frames.export(id, format, polish));
      await reload(); // surface the new document in the Files tab
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportingDoc(false);
      setExportStage(null);
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

  const { media, transcripts, summaries, downloads, documents } = detail;
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
  const seek = (sec: number, play = true) => {
    if (hasPlayer) playerRef.current?.seekTo(sec, { play });
    else
      window.sift.library
        .openExternal(appendTimeParam(media.sourceUrl, sec))
        .catch((e) => setActionError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <main data-testid="media-detail" className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-8">
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
      {/* Player column is deliberately dominant — a bigger preview makes aiming the manual
          frame-capture (and reading slides) far easier. It stays sticky while the tabs scroll. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 lg:sticky lg:top-8 lg:self-start">
          <MediaPlayer
            ref={playerRef}
            filePath={playable?.filePath ?? null}
            thumbnailUrl={media.thumbnailUrl}
            onTime={setCurrentTime}
            onDownload={() => void handleDownloadDefault()}
            downloading={downloadingFormat !== null}
            crop={crop}
            cropEditing={cropEditing}
            onCropDraw={handleCropDraw}
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
              const count =
                t.key === "transcript"
                  ? transcripts.length
                  : t.key === "summary"
                    ? summaries.length
                    : t.key === "slides"
                      ? frames.length
                      : documents.length + transcripts.length + summaries.length + downloads.length;
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
                transcriptRatio={transcriptRatio}
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
            {tab === "slides" && (
              <SlidesPanel
                frames={frames}
                canExtract={hasPlayer}
                extracting={extractingFrames}
                capturing={capturingFrame}
                stage={frameStage}
                autoplay={autoplayOnClick}
                hasCrop={crop !== null}
                cropEditing={cropEditing}
                classifierModel={classifierModel}
                onChangeClassifier={changeClassifier}
                fullScreenOnly={fullScreenOnly}
                onToggleFullScreenOnly={toggleFullScreenOnly}
                canExport={transcripts.length > 0}
                exporting={exportingDoc}
                documentPath={documentPath}
                polish={{
                  providers: pickers.providers,
                  providerId: polishProviderId,
                  setProviderId: setPolishProviderId,
                  models: polishModels,
                  model: polishModel,
                  setModel: setPolishModel,
                  progress: exportStage,
                }}
                onExtract={() => void handleExtractFrames()}
                onCapture={() => void handleCaptureFrame()}
                onToggleAutoplay={toggleAutoplay}
                onToggleInclude={(fid, inc) => void handleToggleInclude(fid, inc)}
                onToggleCropEditing={() => setCropEditing((v) => !v)}
                onClearCrop={handleClearCrop}
                onSeek={(sec) => seek(sec, autoplayOnClick)}
                onExport={(format) => void handleExportDocument(format)}
                onRevealDocument={(path) => void window.sift.library.reveal(path)}
                onSaveSlides={() => void handleSaveSlides()}
              />
            )}
            {tab === "files" && (
              <div className="flex flex-col gap-6">
                <FilesPanel
                  documents={documents}
                  transcripts={transcripts}
                  summaries={summaries}
                  prompts={pickers.prompts}
                  onReveal={(path) => void window.sift.library.reveal(path)}
                  onOpenTab={(t) => setTab(t)}
                />
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Downloads</p>
                  <DownloadsPanel
                    downloads={downloads}
                    downloadingFormat={downloadingFormat}
                    progress={progress}
                    onRetry={(d) => void handleRetryDownload(d)}
                    onRemove={(id) => void handleRemoveDownload(id)}
                  />
                </div>
              </div>
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
  { key: "slides", label: "Slides" },
  { key: "files", label: "Files" },
];
