import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Captions,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FolderOpen,
  Layers,
  Link2,
  Sparkles,
  Trash2,
  Tv,
  User,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TagEditor } from "@/components/tag-editor";
import { useAiPickers } from "@/lib/use-ai-pickers";
import { platformLabel } from "@/lib/platform-label";
import { appendTimeParam } from "@/lib/transcript-view";
import { MediaPlayer, type MediaPlayerHandle } from "./media-player";
import { TranscriptPanel, type TranscribeMode } from "./transcript-panel";
import { ExportMenu } from "./export-menu";
import { DownloadsPanel } from "./downloads-panel";
import { COUNT_ACTIVE, COUNT_ZERO, FilesPanel } from "./files-panel";
import { SummariesPanel } from "./summaries-panel";
import { SlidesPanel } from "./slides-panel";

type DetailTab = "transcript" | "summary" | "slides" | "files";

/** One card recipe for the whole detail route: a top-lit surface (brighter top edge, faint
 * inset highlight) so the panel picks up the ambient warmth instead of sitting flat, and a
 * single 20px padding token on every card. Declared per panel file on purpose — nothing
 * outside this route should depend on it. */
const CARD =
  "rounded-2xl border border-white/[0.07] border-t-white/[0.10] " +
  "bg-gradient-to-b from-white/[0.045] to-white/[0.015] " +
  "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]";

/* The panel's own scroll container wears `.scroll-thin` from globals.css — the "scrollbar
 * inside a card" recipe (a thumb with a transparent gutter so it clears the card's hairline
 * instead of fusing with it into a second bright edge). It used to be a `THIN_SCROLLBAR`
 * arbitrary-variant string declared verbatim here AND in transcript-panel.tsx; the foundation
 * now owns one definition, so the two copies can't drift apart again. */

/** The detail panel leads its siblings by ELEVATION, not by hue: same neutral hairline family
 * as every other card here, one step lighter fill, plus a soft drop. The amber stroke is
 * reserved for :focus-visible — an orange perimeter on a resting panel reads as a stuck ring. */
const PANEL =
  "rounded-2xl border border-white/[0.07] border-t-white/[0.11] " +
  "bg-gradient-to-b from-white/[0.065] to-white/[0.025] " +
  "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_26px_60px_-38px_rgba(0,0,0,0.9)]";

/** Identity row: **only interactive things wear a shell.** Channel, length and platform are
 * facts, so they read as metadata — glyph plus text, no border, no fill. The source link is
 * the one control in the row and is the only item that keeps a pill. */
const META =
  "inline-flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-muted-foreground " +
  "[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:flex-none [&_svg]:text-fg-subtle";

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
export function MediaDetailPage({
  id,
  onBack,
  onRemoved,
  onOpenChannel,
}: MediaDetailPageProps) {
  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(
    null,
  );
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // Which transcript job this view started ("captions"/"whisper"/null) — so only the clicked
  // button shows the progress label; the other merely disables.
  const [transcribeMode, setTranscribeMode] = useState<TranscribeMode>(null);
  const [transcriptStage, setTranscriptStage] = useState<string | null>(null);
  const [transcriptRatio, setTranscriptRatio] = useState<number | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
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
  const [exportStage, setExportStage] = useState<FrameExportProgress | null>(
    null,
  );
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
  const polishModels =
    pickers.providers.find((p) => p.id === polishProviderId)?.models ?? [];
  useEffect(() => {
    if (!polishProviderId) {
      setPolishModel("");
      return;
    }
    setPolishModel((prev) =>
      polishModels.some((m) => m.id === prev)
        ? prev
        : (polishModels[0]?.id ?? ""),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polishProviderId, pickers.providers]);

  useEffect(
    () => window.sift.frames.onExportProgress((p) => setExportStage(p)),
    [],
  );

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
      const option =
        meta.formats.find((o) => o.id === d.formatId) ?? meta.formats[0];
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
    if (
      summarizing ||
      selectedProviderId === "" ||
      selectedModel === "" ||
      selectedPromptId === ""
    )
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
      const tsMs = Math.round(
        (playerRef.current?.getCurrentTime() ?? 0) * 1000,
      );
      await window.sift.frames.capture(id, tsMs);
      setFrames(await window.sift.frames.list(id));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setCapturingFrame(false);
    }
  }

  async function handleToggleInclude(frameId: number, included: boolean) {
    setFrames((fs) =>
      fs.map((f) => (f.id === frameId ? { ...f, included } : f)),
    ); // optimistic
    try {
      await window.sift.frames.setIncluded(frameId, included);
    } catch (e) {
      setFrames((fs) =>
        fs.map((f) => (f.id === frameId ? { ...f, included: !included } : f)),
      );
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
    window.sift.frames
      .setCrop(id, c)
      .catch((e) => setActionError(e instanceof Error ? e.message : String(e)));
  }

  function handleClearCrop() {
    setCrop(null);
    setCropEditing(false);
    window.sift.frames
      .setCrop(id, null)
      .catch((e) => setActionError(e instanceof Error ? e.message : String(e)));
  }

  function copyUrl() {
    void navigator.clipboard.writeText(media.sourceUrl).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 1200);
    });
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
    const polish =
      polishProviderId && polishModel
        ? { providerId: polishProviderId, model: polishModel }
        : undefined;
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

  async function handleExportSrt(transcriptId: number) {
    try {
      const path = await window.sift.transcript.exportSrt(transcriptId);
      await window.sift.library.reveal(path);
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
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center p-8">
        <div className="panel-lit p-6">
          <p className="eyebrow">Error</p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground">
            This item wouldn&apos;t open.
          </h2>
          <p
            data-testid="media-detail-error"
            className="mt-3 rounded-xl border border-danger/25 bg-danger/[0.08] px-3.5 py-2.5 text-sm text-danger"
          >
            {error}
          </p>
          <Button
            variant="outline"
            data-testid="media-detail-back"
            onClick={onBack}
            className="mt-4"
          >
            Back to library
          </Button>
        </div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <span
            aria-hidden
            className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none"
          />
          <p
            data-testid="media-detail-loading"
            className="text-sm text-muted-foreground"
          >
            Loading…
          </p>
        </div>
      </main>
    );
  }

  const { media, transcripts, summaries, downloads, documents } = detail;
  const activeTab = TAB_META[tab];
  const durationLabel = formatDuration(media.durationSec);
  const sourceDisplay = media.sourceUrl.replace(/^https?:\/\/(www\.)?/, "");
  // Channel tracking is keyed on a YouTube channel_id (yt-dlp flat-playlist listing) — it can't
  // list an X/Twitter/etc. profile. Only offer "Open channel" for YouTube media; others use Live URL.
  const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(media.sourceUrl);
  const playable =
    downloads.find((d) => d.status === "done" && d.filePath) ?? null;
  const hasPlayer = playable !== null;
  // With a local player, clicking a transcript line seeks it; otherwise fall back to
  // opening the source in the browser at that timestamp (the pre-player behavior).
  const seek = (sec: number, play = true) => {
    if (hasPlayer) playerRef.current?.seekTo(sec, { play });
    else
      window.sift.library
        .openExternal(appendTimeParam(media.sourceUrl, sec))
        .catch((e) =>
          setActionError(e instanceof Error ? e.message : String(e)),
        );
  };

  return (
    // On a wide window this route owns exactly one viewport and never scrolls the page: main is
    // pinned to the pane height (min-h-0 defeats the flex item's automatic content minimum) so a
    // tall tab can't grow the document, raise a native scrollbar, and shift every card 5px left.
    // Below lg the columns stack and the page scrolls normally again.
    <main
      data-testid="media-detail"
      className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-6 p-8 lg:min-h-0 lg:overflow-hidden"
    >
      {/* Page header: navigation + destructive actions on one line, then the identity block
          (eyebrow → title → metadata pills → source chip), mirroring every other route. */}
      <header className="flex flex-none flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Every marked action on this row wears a lucide glyph — including this one. It read
              "← Library" with the arrow set in the text run, which made it the last place on the
              surface encoding an affordance as a typed character, three buttons away from the
              "Live URL" that had just stopped doing exactly that. Same 14px glyph, same gap, and
              the accessible name is still "Library". */}
          <Button
            variant="outline"
            size="sm"
            data-testid="media-detail-back"
            onClick={onBack}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Library
          </Button>
          {/* Both header links are marked, and each is marked by a lucide glyph like every other
              action on the route (Re-fetch, Export .srt, Open, Run prompt). "Live URL" carried a
              typographic "↗" set in the text run — same failure as the back button above — and
              "Open channel" carried nothing at all. The two
              glyphs differ because the destinations do: `ExternalLink` leaves the app for the
              source platform, `Tv` is the Channels view's own nav glyph and this button stays
              in-app (handleOpenChannel resolves the channel and switches views). */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              data-testid="media-detail-open-source"
              onClick={() =>
                void window.sift.library.openExternal(media.sourceUrl)
              }
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Live URL
            </Button>
            {onOpenChannel && isYouTube && (
              <Button
                variant="outline"
                size="sm"
                data-testid="media-detail-open-channel"
                onClick={() => onOpenChannel(media.id)}
              >
                <Tv className="h-3.5 w-3.5" aria-hidden />
                Open channel
              </Button>
            )}
            {/* A destructive delete is separated from the link pair by a rule — but it keeps the
                same pill chrome as its siblings. A naked glyph beside two bordered buttons gives
                the one irreversible action the smallest hit target on the row. */}
            {/* `mx-2` on top of the row's own `gap-2` = 16px of air on BOTH sides. The old
                `ml-3 mr-1` stacked unevenly with the gap (21px left, 13px right) and the rule
                sat visibly off-centre between the link pair and the trash button. */}
            <ExportMenu mediaId={id} />
            <span aria-hidden className="mx-2 h-6 w-px flex-none bg-white/10" />
            {confirmingRemove ? (
              <>
                <Button
                  size="sm"
                  variant="danger"
                  data-testid="media-detail-remove-confirm"
                  onClick={() => void handleRemove()}
                >
                  Confirm remove
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmingRemove(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove"
                title="Remove from library"
                data-testid="media-detail-remove"
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:border-danger/30 hover:bg-danger/10 hover:text-danger"
                onClick={() => setConfirmingRemove(true)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        </div>

        {/* The identity block sits on its own surface, like the hero band in the reference —
            a header floating straight on the canvas reads as unfinished. */}
        <div className={`${CARD} p-5`}>
          <p className="eyebrow">Media</p>
          <h2
            data-testid="media-detail-title"
            className="mt-2 max-w-4xl text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground"
          >
            {media.title}
          </h2>
          {/* Three facts and one control. Identical pills for both used to promise that the
              duration was as clickable as the URL; now only the thing you can act on is a
              pill, and its copy button sits behind a hairline instead of hiding inside the
              shell with no divider and no hover cue. */}
          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {media.uploader && (
              <span className={META}>
                <User aria-hidden />
                <span className="truncate">{media.uploader}</span>
              </span>
            )}
            {durationLabel && (
              <span className={`${META} tabular-nums`}>
                <Clock aria-hidden />
                {durationLabel}
              </span>
            )}
            {media.platformId && (
              <span className={META}>
                <Tv aria-hidden />
                {platformLabel(media.platformId)}
              </span>
            )}
            {/* The one pill in the row: clicking the URL copies it, and so does the inset
                button — one action, two targets, one visible seam. */}
            <span className="inline-flex min-w-0 max-w-full items-stretch rounded-full border border-white/[0.08] bg-white/[0.04]">
              <button
                type="button"
                data-testid="media-detail-source"
                onClick={copyUrl}
                className="flex min-w-0 items-center gap-1.5 rounded-l-full py-1 pl-2.5 pr-2 text-[13px] leading-5 text-fg-secondary transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                title="Click to copy"
              >
                <Link2
                  aria-hidden
                  className="h-3.5 w-3.5 flex-none text-primary"
                />
                <span className="min-w-0 max-w-[24rem] truncate">
                  {sourceDisplay}
                </span>
              </button>
              <span className="relative flex-none border-l border-white/[0.08]">
                <button
                  type="button"
                  data-testid="media-detail-source-copy"
                  aria-label="Copy URL"
                  onClick={copyUrl}
                  className="grid h-full w-8 place-items-center rounded-r-full text-fg-subtle transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                >
                  {urlCopied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                {urlCopied && (
                  <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 -translate-x-1/2 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-pop">
                    Copied
                  </span>
                )}
              </span>
            </span>
          </div>
        </div>
      </header>

      {actionError && (
        <p
          data-testid="media-detail-action-error"
          className="flex-none rounded-xl border border-danger/25 bg-danger/[0.08] px-4 py-3 text-sm text-danger"
        >
          {actionError}
        </p>
      )}

      {/* Player + tags on the left; tabbed content on the right. Stacks on narrow windows.
          `lg:grid-rows-1` (grid-template-rows: repeat(1, minmax(0,1fr))) is the load-bearing
          bit: with an implicit auto row
          the tallest tab sized the row, the left column stretched with it, the tags card fell
          below the fold and the page grew a scrollbar. Pinning the row to the grid's own height
          makes the left column byte-identical on all four tabs and hands the right panel a
          bounded box to scroll inside. */}
      <div className="grid grid-cols-1 gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)] lg:grid-rows-1">
        <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
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
          {/* TagEditor renders its own eyebrow — this card must not repeat it. One rule governs
              eyebrow colour: a top-level card title (MEDIA, TAGS) is the plain `.eyebrow`
              token, full stop. TAGS shipped with a local `text-muted-foreground` override, so
              two labels doing the same structural job rendered in two different greys; the
              variant below restores it to `.eyebrow`'s own colour without reaching into the
              shared component (its popover's "Existing tags" head sits deeper and is untouched).
              flex-none + mt-auto: it is present and the same height on every tab, pinned to the
              column's baseline so both halves of the page terminate on one line. */}
          <div
            className={`${CARD} mt-auto flex-none p-5 [&>[data-testid=tag-editor]>div>p]:text-fg-subtle`}
          >
            <TagEditor
              mediaId={media.id}
              tags={detail.tags}
              onChange={reload}
            />
          </div>
        </div>

        {/* One panel, not a floating tab strip above a card: the tabs are the panel's header, so
            the right column's first surface starts on exactly the same y as the player card. */}
        <section
          className={`${PANEL} relative flex min-w-0 flex-col overflow-hidden lg:min-h-0`}
        >
          <div className="flex flex-none items-center gap-5 border-b border-white/[0.07] px-5">
            {TABS.map((key) => {
              // Files: one term per section, and each artifact belongs to exactly one section —
              // FilesPanel lists every document once (AI-polished ones marked, not repeated),
              // so this sum is the number of rows the tab actually renders. It read "3" over
              // four rows while summaries were mirrored into a second "Prompts run" list.
              const count =
                key === "transcript"
                  ? transcripts.length
                  : key === "summary"
                    ? summaries.length
                    : key === "slides"
                      ? frames.length
                      : documents.length +
                        transcripts.length +
                        summaries.length +
                        downloads.length;
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  data-testid={`media-detail-tab-${key}`}
                  onClick={() => setTab(key)}
                  className={`relative flex h-12 items-center gap-1.5 text-[13px] font-medium tracking-tight transition-colors ${
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground/85"
                  }`}
                >
                  {TAB_META[key].label}
                  {/* The shared pill primitive's `count` tone — the same box every section head
                      in the Files tab renders, one step brighter on the selected tab. */}
                  {count > 0 && (
                    <Badge
                      variant="count"
                      className={active ? COUNT_ACTIVE : undefined}
                    >
                      {count}
                    </Badge>
                  )}
                  {active && (
                    <motion.span
                      layoutId="media-detail-tab-underline"
                      className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-gradient-to-r from-primary to-primary-lit"
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 32,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* The panel body is the ONLY scroll container on this side of the page, on every tab:
              a bounded box, a 6px thumb-only bar and a stable gutter, so the card's bottom edge
              and radius stay visible and switching tabs never moves an x coordinate. */}
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto p-5 [scrollbar-gutter:stable]"
          >
            {/* No eyebrow here: it only ever restated the tab you just clicked ("Transcript"
                over TRANSCRIPT), costing a line and 12px of rhythm. The tab strip names the
                panel; the tagline is the panel's only heading. The amber eyebrow stays a
                top-level card device (MEDIA, TAGS). */}
            {/* The glyph is a bare 16px mark, not a 32px chip: in a box it wore the exact chrome
                of the real icon button 240px above it (same size, radius and white-alpha fill)
                while being aria-hidden decoration that only restates the tab you just clicked —
                an ambiguous affordance in the panel's most prominent row. */}
            <div className="mb-4 flex flex-none items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-foreground">
                {activeTab.title}
              </h3>
              <activeTab.Icon
                aria-hidden
                className="h-4 w-4 flex-none text-fg-subtle"
              />
            </div>
            {tab === "transcript" && (
              <TranscriptPanel
                transcripts={transcripts}
                hasPlayer={hasPlayer}
                currentTime={currentTime}
                transcribeMode={transcribeMode}
                transcriptStage={transcriptStage}
                transcriptRatio={transcriptRatio}
                canRetranscribe={downloads.some(
                  (d) => d.status === "done" && d.filePath,
                )}
                onSeek={seek}
                onGetTranscript={() => void handleGetTranscript()}
                onRetranscribe={() => void handleRetranscribe()}
                onRemoveTranscript={(id) => void handleRemoveTranscript(id)}
                onExportSrt={(id) => void handleExportSrt(id)}
                mediaId={id}
                onTranscriptEdited={() => void reload()}
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
                onToggleInclude={(fid, inc) =>
                  void handleToggleInclude(fid, inc)
                }
                onToggleCropEditing={() => setCropEditing((v) => !v)}
                onClearCrop={handleClearCrop}
                onSeek={(sec) => seek(sec, autoplayOnClick)}
                onExport={(format) => void handleExportDocument(format)}
                onRevealDocument={(path) =>
                  void window.sift.library.reveal(path)
                }
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
                {/* Same section-head recipe as FilesPanel: label, count pill, then the rule
                    filling whatever is left. */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                      Downloads
                    </p>
                    <Badge
                      variant="count"
                      className={
                        downloads.length > 0
                          ? "flex-none"
                          : `flex-none ${COUNT_ZERO}`
                      }
                    >
                      {downloads.length}
                    </Badge>
                    <span className="h-px flex-1 bg-white/[0.06]" aria-hidden />
                  </div>
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
          </motion.div>
          {/* 24px bottom fade: when the body does scroll, a hard cut at the rounded edge reads
              as breakage rather than as more content below. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-px bottom-px h-6 rounded-b-2xl bg-gradient-to-t from-[hsl(var(--background)/0.5)] to-transparent"
          />
        </section>
      </div>
    </main>
  );
}

/** Tab metadata. `label` is what the tab strip shows; `title` is the one heading inside the
 * panel — there is deliberately no eyebrow field, because an eyebrow here could only ever
 * repeat the label two rows above it. */
interface TabMeta {
  label: string;
  title: string;
  Icon: LucideIcon;
}

const TAB_META: Record<DetailTab, TabMeta> = {
  transcript: {
    label: "Transcript",
    title: "Every line, timestamped.",
    Icon: Captions,
  },
  // The key, the testid (`media-detail-tab-summary`), this tab's own title copy and every
  // record it holds all say "summary"; the label said "Tools", which was the one name in the
  // set that did not describe what is on the tab. A reader looking for the AI write-up had to
  // guess, and anything referring to this surface by name disagreed with the app.
  summary: {
    label: "Summary",
    title: "Run a prompt over the transcript.",
    Icon: Sparkles,
  },
  slides: {
    label: "Slides",
    title: "Frames that carry the data.",
    Icon: Layers,
  },
  files: {
    label: "Files",
    title: "Everything made from this video.",
    Icon: FolderOpen,
  },
};

const TABS: DetailTab[] = ["transcript", "summary", "slides", "files"];
