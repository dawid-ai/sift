import { useEffect, useRef } from "react";
import { Camera, Check, ChevronDown, Crop, FileDown, FolderOpen, Layers, Sparkles, X } from "lucide-react";
import type { AiProviderInfo, FrameExportProgress, FrameProgress, FrameRecord } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** mm:ss (or h:mm:ss) from milliseconds. */
function formatTs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** Button label while a run is in flight. */
function stageLabel(stage: FrameProgress | null): string {
  if (!stage) return "Working…";
  if (stage.stage === "extracting") return "Scanning video…";
  if (stage.stage === "reading") return `Reading slides… ${stage.processed}/${stage.total}`;
  return "Finishing…";
}

/** 0..1 fill for the progress bar: scan ratio while extracting, read fraction while reading. */
function stageFraction(stage: FrameProgress | null): number | null {
  if (!stage) return null;
  if (stage.stage === "extracting") return stage.ratio; // may be null (unknown duration)
  if (stage.stage === "reading") return stage.total > 0 ? stage.processed / stage.total : null;
  return 1;
}

/** Nested surface, one step lighter than the panel around it: top-lit, 20px padding. */
const NESTED =
  "rounded-xl border border-white/[0.07] border-t-white/[0.10] bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-5";

const GHOST_BUTTON =
  "border border-white/10 bg-transparent text-muted-foreground hover:border-white/20 hover:bg-white/[0.04] hover:text-foreground";

/** Empty states are not drop targets, so they don't wear the dashed drop-zone idiom. */
const EMPTY_BOX =
  "flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-9 text-center";
const EMPTY_CHIP = "grid h-8 w-8 place-items-center rounded-lg bg-white/[0.05] text-foreground/50";

/** Nested-surface heading: a small caps label with a hairline running out to the edge. */
function BlockHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">{title}</p>
        <span className="h-px flex-1 bg-white/[0.06]" aria-hidden />
      </div>
      {note && <p className="text-[13px] leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  );
}

// h-9 inline control token, shared with every other secondary control on the route.
const SELECT_CLASS =
  "h-9 appearance-none rounded-xl border border-white/10 bg-white/[0.03] pl-2.5 pr-7 text-xs text-foreground transition-colors hover:border-white/20 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50";

export interface SlidesPanelProps {
  frames: FrameRecord[];
  /** The video must be downloaded before frames can be extracted or captured. */
  canExtract: boolean;
  extracting: boolean;
  capturing: boolean;
  stage: FrameProgress | null;
  autoplay: boolean;
  hasCrop: boolean;
  cropEditing: boolean;
  classifierModel: string;
  onChangeClassifier: (model: string) => void;
  fullScreenOnly: boolean;
  onToggleFullScreenOnly: () => void;
  /** A transcript is required to build the document (it's the interleave backbone). */
  canExport: boolean;
  exporting: boolean;
  documentPath: string | null;
  /** Document AI-polish selection. providerId "" = No AI (raw). */
  polish: {
    providers: AiProviderInfo[];
    providerId: string;
    setProviderId: (id: string) => void;
    models: { id: string; label: string }[];
    model: string;
    setModel: (m: string) => void;
    progress: FrameExportProgress | null;
  };
  onExtract: () => void;
  onCapture: () => void;
  onToggleAutoplay: () => void;
  onToggleInclude: (frameId: number, included: boolean) => void;
  onToggleCropEditing: () => void;
  onClearCrop: () => void;
  onSeek: (sec: number) => void;
  onExport: (format: "md" | "pdf") => void;
  onRevealDocument: (path: string) => void;
  /** Prompts for a folder and saves the selected slides there at full resolution. */
  onSaveSlides: () => void;
}

/** Extracts, captures, and curates data-bearing frames (slides/charts) from the video. */
// Current-engine Ollama vision models (llama3.2-vision was dropped — its mllama support
// never landed upstream). Ordered best-fit-first for slide/chart/document detection; the
// user must `ollama pull` whichever they select.
const VISION_MODELS = ["qwen2.5vl:7b", "minicpm-v", "gemma3:12b"];

export function SlidesPanel({
  frames, canExtract, extracting, capturing, stage, autoplay, hasCrop, cropEditing,
  classifierModel, onChangeClassifier, fullScreenOnly, onToggleFullScreenOnly,
  canExport, exporting, documentPath, polish,
  onExtract, onCapture, onToggleAutoplay, onToggleInclude, onToggleCropEditing, onClearCrop, onSeek,
  onExport, onRevealDocument, onSaveSlides,
}: SlidesPanelProps) {
  const includedCount = frames.filter((f) => f.included).length;
  const stripRef = useRef<HTMLDivElement>(null);

  // A plain vertical wheel scrolls the filmstrip sideways — most mice have no tilt wheel.
  // Has to be a native non-passive listener: React registers `wheel` as passive, so
  // preventDefault() in an onWheel prop is a no-op and the page would scroll too.
  const hasFrames = frames.length > 0;
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || e.shiftKey) return; // shift-wheel / trackpad already scroll sideways
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasFrames]);

  return (
    <div className="flex flex-col gap-4">
      <div className={`${NESTED} flex flex-col gap-3.5`}>
        <BlockHead
          title="Slides & on-screen text"
          note={
            "Pulls frames that carry data — slides, charts, names — and reads their text. " +
            "Only the selected frames feed the summary and document."
          }
        />
        {!canExtract && (
          <p
            data-testid="media-detail-frames-need-download"
            className="rounded-lg border border-warning/25 bg-warning/[0.08] px-3 py-2 text-xs text-warning"
          >
            Download the video first to extract or capture slides.
          </p>
        )}
        {/* One filled CTA per block; the capture alternative is a ghost at the inline height. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            data-testid="media-detail-extract-frames"
            disabled={!canExtract || extracting}
            onClick={onExtract}
          >
            <Layers className="h-4 w-4" aria-hidden />
            {extracting ? stageLabel(stage) : frames.length > 0 ? "Re-extract slides" : "Extract slides"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={GHOST_BUTTON}
            data-testid="media-detail-capture-frame"
            disabled={!canExtract || capturing}
            onClick={onCapture}
            title="Grab the frame at the current playhead"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden />
            {capturing ? "Capturing…" : "Capture current frame"}
          </Button>
        </div>

        {/* Toggles + the slide-region crop, kept on one hairline-separated shelf so the
            action buttons above stay the loudest thing in the block. */}
        <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-3.5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                data-testid="media-detail-autoplay-toggle"
                checked={autoplay}
                onChange={onToggleAutoplay}
                className="h-3.5 w-3.5 cursor-pointer accent-primary"
              />
              Autoplay on click
            </label>
            {/* Keep only bright full-screen slides — skips the wide lecture-room shots where the
                slide is just a small projected rectangle. Assumes light-themed slides. */}
            <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                data-testid="media-detail-fullscreen-only"
                checked={fullScreenOnly}
                onChange={onToggleFullScreenOnly}
                className="h-3.5 w-3.5 cursor-pointer accent-primary"
              />
              Only full-screen slides (skip room/camera shots)
            </label>
          </div>

          {/* Slide-region crop: restrict extraction to a box (excludes browser chrome, side cams). */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Button
              size="sm"
              variant={cropEditing ? "default" : "ghost"}
              className={cropEditing ? undefined : GHOST_BUTTON}
              data-testid="media-detail-set-region"
              disabled={!canExtract}
              onClick={onToggleCropEditing}
            >
              <Crop className="h-3.5 w-3.5" aria-hidden />
              {cropEditing ? "Done" : hasCrop ? "Edit slide region" : "Set slide region"}
            </Button>
            {hasCrop && !cropEditing && (
              <Button
                size="sm"
                variant="ghost"
                data-testid="media-detail-clear-region"
                disabled={!canExtract}
                onClick={onClearCrop}
                className="border border-white/10 bg-transparent text-muted-foreground hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
              >
                Remove slide region
              </Button>
            )}
            {hasCrop && !cropEditing && (
              <span className="text-muted-foreground">Extraction limited to the marked region.</span>
            )}
            {cropEditing && <span className="text-primary">Drag a box over the slide on the video.</span>}
          </div>

          {/* AI slide detection: an Ollama vision model rejects talking heads / rooms / charts-in-a-room
              that crop + OCR can't. Opt-in (needs Ollama + a pulled vision model) and much slower. */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label
              htmlFor="slide-classifier"
              className={`flex items-center gap-1.5 font-medium ${classifierModel ? "text-primary" : "text-muted-foreground"}`}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              AI slide detection
            </label>
            <span className="relative inline-flex items-center">
              <select
                id="slide-classifier"
                data-testid="media-detail-classifier"
                value={classifierModel}
                onChange={(e) => onChangeClassifier(e.target.value)}
                className={cn(SELECT_CLASS, classifierModel && "border-primary/35 text-primary")}
              >
                <option value="">Off</option>
                {VISION_MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <ChevronDown
                aria-hidden
                className="pointer-events-none absolute right-2 h-3 w-3 text-foreground/40"
              />
            </span>
            {classifierModel && (
              <span className="text-muted-foreground">via Ollama — must be pulled; slower.</span>
            )}
          </div>
        </div>

        {extracting && (
          <div data-testid="media-detail-frames-progress" className="flex flex-col gap-1.5">
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
              {(() => {
                const frac = stageFraction(stage);
                return frac === null ? (
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
                ) : (
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${Math.round(frac * 100)}%` }}
                  />
                );
              })()}
            </div>
            {stage?.stage === "reading" && stage.kept > 0 && (
              <p className="text-xs tabular-nums text-muted-foreground">{stage.kept} slides kept so far</p>
            )}
          </div>
        )}
      </div>

      {frames.length === 0 ? (
        <div data-testid="media-detail-frames-empty" className={EMPTY_BOX}>
          <span className={EMPTY_CHIP} aria-hidden>
            <Layers className="h-4 w-4" />
          </span>
          <p className="text-[13px] font-semibold text-foreground">No slides yet.</p>
          <p className="max-w-[40ch] text-[13px] leading-relaxed text-muted-foreground">
            Extract to find data-bearing frames, or capture one from the player.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold tabular-nums text-primary">{includedCount}</span>
              {" of "}
              <span className="tabular-nums text-foreground/70">{frames.length}</span>
              {" selected for the document"}
            </p>
            <Button
              size="sm"
              variant="ghost"
              className={`${GHOST_BUTTON} ml-auto`}
              data-testid="media-detail-save-slides"
              disabled={includedCount === 0}
              onClick={onSaveSlides}
              title="Save the selected slides to a folder at full resolution"
            >
              <FolderOpen className="h-3.5 w-3.5" aria-hidden />
              Save slides…
            </Button>
          </div>
          {/* Horizontal filmstrip: slides can run to dozens, and a grid pushed the export
              controls off-screen. Scrolls sideways with snap so the panel keeps a fixed height. */}
          {/* snap-proximity, not mandatory: mandatory fights the incremental scrollLeft the
              wheel handler applies, snapping back mid-gesture. */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div ref={stripRef} className="flex snap-x snap-proximity gap-3 overflow-x-auto pb-2">
              {frames.map((f) => (
                <div
                  key={f.id}
                  data-testid="media-detail-frame"
                  // Right-click anywhere on the card toggles include — no hunting for the checkbox.
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onToggleInclude(f.id, !f.included);
                  }}
                  className={`flex w-48 flex-none snap-start flex-col overflow-hidden rounded-lg border bg-white/[0.03] transition-colors ${
                    f.included ? "border-white/[0.16]" : "border-white/[0.06]"
                  }`}
                  title={`${f.ocrText ?? ""}\n(right-click to ${f.included ? "exclude" : "include"})`.trim()}
                >
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => onSeek(f.tsMs / 1000)}
                      className="block w-full"
                      title="Jump to this moment"
                    >
                      <img
                        src={f.imageUrl}
                        alt=""
                        className={`aspect-video w-full bg-[#0b0908] object-cover ${f.included ? "" : "opacity-40"}`}
                      />
                    </button>
                    {/* Timestamp chip, like a duration badge on a video thumbnail. */}
                    <span className="pointer-events-none absolute bottom-1.5 left-1.5 inline-flex items-center rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary">
                      {formatTs(f.tsMs)}
                      {f.kind === "manual" && <span className="text-foreground/45"> · manual</span>}
                    </span>
                    {/* State marker — shape + glyph, not colour alone. */}
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full ${
                        f.included
                          ? "bg-primary text-primary-foreground"
                          : "bg-background/85 text-foreground/45 ring-1 ring-inset ring-white/15"
                      }`}
                    >
                      {f.included ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 border-t border-white/[0.06] p-2.5">
                    <input
                      type="checkbox"
                      data-testid="media-detail-frame-include"
                      checked={f.included}
                      onChange={(e) => onToggleInclude(f.id, e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary"
                      title={f.included ? "Included in document" : "Excluded"}
                    />
                    <div className="flex min-w-0 flex-col gap-1">
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${
                          f.included ? "text-primary" : "text-foreground/40"
                        }`}
                      >
                        {f.included ? "Included" : "Excluded"}
                      </span>
                      {f.ocrText && (
                        <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{f.ocrText}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* No-AI document: interleaves the selected slides into the transcript. */}
          <div className={`${NESTED} flex flex-col gap-3.5`}>
            <BlockHead
              title="Create document"
              note={`Builds a transcript with the ${includedCount} selected slide${
                includedCount === 1 ? "" : "s"
              } dropped in at their timestamps. No AI.`}
            />
            {!canExport && (
              <p className="rounded-lg border border-warning/25 bg-warning/[0.08] px-3 py-2 text-xs text-warning">
                Get a transcript first to build the document.
              </p>
            )}

            {/* Polish with: rewrite each transcript section into clean, dense prose. Slides stay put.
                "No AI" is the zero-cost default; local (Ollama) or external (API / Claude Code CLI). */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label
                htmlFor="doc-polish"
                className={`flex items-center gap-1.5 font-medium ${polish.providerId ? "text-primary" : "text-muted-foreground"}`}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Polish with
              </label>
              <span className="relative inline-flex items-center">
                <select
                  id="doc-polish"
                  data-testid="media-detail-polish-provider"
                  value={polish.providerId}
                  disabled={exporting}
                  onChange={(e) => polish.setProviderId(e.target.value)}
                  className={cn(SELECT_CLASS, polish.providerId && "border-primary/35 text-primary")}
                >
                  <option value="">No AI (raw)</option>
                  {polish.providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown aria-hidden className="pointer-events-none absolute right-2 h-3 w-3 text-foreground/40" />
              </span>
              {polish.providerId && (
                <span className="relative inline-flex items-center">
                  <select
                    data-testid="media-detail-polish-model"
                    value={polish.model}
                    disabled={exporting || polish.models.length === 0}
                    onChange={(e) => polish.setModel(e.target.value)}
                    className={cn(SELECT_CLASS, "border-primary/35 text-primary")}
                  >
                    {polish.models.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden className="pointer-events-none absolute right-2 h-3 w-3 text-primary/60" />
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                data-testid="media-detail-export-pdf"
                disabled={!canExport || exporting || includedCount === 0}
                onClick={() => onExport("pdf")}
              >
                <FileDown className="h-4 w-4" aria-hidden />
                {exporting ? "Creating…" : "PDF"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={GHOST_BUTTON}
                data-testid="media-detail-export-md"
                disabled={!canExport || exporting || includedCount === 0}
                onClick={() => onExport("md")}
              >
                Markdown
              </Button>
            </div>
            {exporting && polish.providerId && (
              <p
                data-testid="media-detail-export-progress"
                className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                Distilling the transcript with AI — this can take a while…
              </p>
            )}
            {documentPath && (
              <button
                type="button"
                data-testid="media-detail-document-path"
                onClick={() => onRevealDocument(documentPath)}
                className="flex max-w-full items-center gap-2 rounded-lg border border-success/25 bg-success/[0.08] px-3 py-2 text-left text-xs text-success transition-colors hover:border-success/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                title={documentPath}
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">Saved to {documentPath} — reveal</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
