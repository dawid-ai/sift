import type { AiProviderInfo, FrameExportProgress, FrameProgress, FrameRecord } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";

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
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-foreground/[0.02] p-4">
        <p className="text-sm font-medium">Slides & on-screen text</p>
        <p className="mt-1 text-sm text-foreground/55">
          Pulls frames that carry data — slides, charts, names — and reads their text. Only the
          selected frames feed the summary and document.
        </p>
        {!canExtract && (
          <p data-testid="media-detail-frames-need-download" className="mt-3 text-sm text-foreground/50">
            Download the video first to extract or capture slides.
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            data-testid="media-detail-extract-frames"
            disabled={!canExtract || extracting}
            onClick={onExtract}
          >
            {extracting ? stageLabel(stage) : frames.length > 0 ? "Re-extract slides" : "Extract slides"}
          </Button>
          <Button
            variant="outline"
            data-testid="media-detail-capture-frame"
            disabled={!canExtract || capturing}
            onClick={onCapture}
            title="Grab the frame at the current playhead"
          >
            {capturing ? "Capturing…" : "Capture current frame"}
          </Button>
          <label className="ml-auto flex cursor-pointer select-none items-center gap-1.5 text-xs text-foreground/60">
            <input
              type="checkbox"
              data-testid="media-detail-autoplay-toggle"
              checked={autoplay}
              onChange={onToggleAutoplay}
            />
            Autoplay on click
          </label>
        </div>

        {/* Keep only bright full-screen slides — skips the wide lecture-room shots where the
            slide is just a small projected rectangle. Assumes light-themed slides. */}
        <label className="mt-2 flex w-fit cursor-pointer select-none items-center gap-1.5 text-xs text-foreground/60">
          <input
            type="checkbox"
            data-testid="media-detail-fullscreen-only"
            checked={fullScreenOnly}
            onChange={onToggleFullScreenOnly}
          />
          Only full-screen slides (skip room/camera shots)
        </label>

        {/* Slide-region crop: restrict extraction to a box (excludes browser chrome, side cams). */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <Button
            size="sm"
            variant={cropEditing ? "default" : "outline"}
            data-testid="media-detail-set-region"
            disabled={!canExtract}
            onClick={onToggleCropEditing}
          >
            {cropEditing ? "Done" : hasCrop ? "Edit slide region" : "Set slide region"}
          </Button>
          {hasCrop && !cropEditing && (
            <Button
              size="sm"
              variant="outline"
              data-testid="media-detail-clear-region"
              disabled={!canExtract}
              onClick={onClearCrop}
              className="text-red-600 hover:text-red-600 dark:text-red-400"
            >
              Remove slide region
            </Button>
          )}
          {hasCrop && !cropEditing && (
            <span className="text-foreground/50">Extraction limited to the marked region.</span>
          )}
          {cropEditing && <span className="text-foreground/50">Drag a box over the slide on the video.</span>}
        </div>

        {/* AI slide detection: an Ollama vision model rejects talking heads / rooms / charts-in-a-room
            that crop + OCR can't. Opt-in (needs Ollama + a pulled vision model) and much slower. */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground/60">
          <label htmlFor="slide-classifier">AI slide detection</label>
          <select
            id="slide-classifier"
            data-testid="media-detail-classifier"
            value={classifierModel}
            onChange={(e) => onChangeClassifier(e.target.value)}
            className="rounded border border-border bg-transparent px-1.5 py-0.5"
          >
            <option value="">Off</option>
            {VISION_MODELS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {classifierModel && (
            <span className="text-foreground/45">via Ollama — must be pulled; slower.</span>
          )}
        </div>
        {extracting && (
          <div className="mt-3" data-testid="media-detail-frames-progress">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
              {(() => {
                const frac = stageFraction(stage);
                return frac === null ? (
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
                ) : (
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${Math.round(frac * 100)}%` }}
                  />
                );
              })()}
            </div>
            {stage?.stage === "reading" && stage.kept > 0 && (
              <p className="mt-1 text-xs text-foreground/50">{stage.kept} slides kept so far</p>
            )}
          </div>
        )}
      </div>

      {frames.length === 0 ? (
        <p
          data-testid="media-detail-frames-empty"
          className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-foreground/50"
        >
          No slides yet. Extract to find data-bearing frames, or capture one from the player.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <p className="text-xs text-foreground/50">{includedCount} of {frames.length} selected for the document</p>
            <Button
              size="sm"
              variant="outline"
              data-testid="media-detail-save-slides"
              disabled={includedCount === 0}
              onClick={onSaveSlides}
              className="ml-auto"
              title="Save the selected slides to a folder at full resolution"
            >
              Save slides…
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {frames.map((f) => (
              <div
                key={f.id}
                data-testid="media-detail-frame"
                // Right-click anywhere on the card toggles include — no hunting for the checkbox.
                onContextMenu={(e) => {
                  e.preventDefault();
                  onToggleInclude(f.id, !f.included);
                }}
                className={`flex flex-col overflow-hidden rounded-lg border transition-opacity ${
                  f.included ? "border-border" : "border-dashed border-border opacity-40"
                }`}
                title={`${f.ocrText ?? ""}\n(right-click to ${f.included ? "exclude" : "include"})`.trim()}
              >
                <button
                  type="button"
                  onClick={() => onSeek(f.tsMs / 1000)}
                  className="block w-full"
                  title="Jump to this moment"
                >
                  <img src={f.imageUrl} alt="" className="aspect-video w-full bg-foreground/5 object-cover" />
                </button>
                <div className="flex items-start gap-1.5 p-2">
                  <input
                    type="checkbox"
                    data-testid="media-detail-frame-include"
                    checked={f.included}
                    onChange={(e) => onToggleInclude(f.id, e.target.checked)}
                    className="mt-0.5 shrink-0"
                    title={f.included ? "Included in document" : "Excluded"}
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-xs tabular-nums text-primary">
                      {formatTs(f.tsMs)}
                      {f.kind === "manual" && <span className="text-foreground/40"> · manual</span>}
                    </span>
                    {f.ocrText && (
                      <span className="line-clamp-2 text-xs text-foreground/60">{f.ocrText}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* No-AI document: interleaves the selected slides into the transcript. */}
          <div className="rounded-xl border border-border bg-foreground/[0.02] p-4">
            <p className="text-sm font-medium">Create document</p>
            <p className="mt-1 text-sm text-foreground/55">
              Builds a transcript with the {includedCount} selected slide{includedCount === 1 ? "" : "s"} dropped
              in at their timestamps. No AI.
            </p>
            {!canExport && (
              <p className="mt-2 text-sm text-foreground/50">Get a transcript first to build the document.</p>
            )}

            {/* Polish with: rewrite each transcript section into clean, dense prose. Slides stay put.
                "No AI" is the zero-cost default; local (Ollama) or external (API / Claude Code CLI). */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-foreground/60">
              <label htmlFor="doc-polish">Polish with</label>
              <select
                id="doc-polish"
                data-testid="media-detail-polish-provider"
                value={polish.providerId}
                disabled={exporting}
                onChange={(e) => polish.setProviderId(e.target.value)}
                className="rounded border border-border bg-transparent px-1.5 py-0.5"
              >
                <option value="">No AI (raw)</option>
                {polish.providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              {polish.providerId && (
                <select
                  data-testid="media-detail-polish-model"
                  value={polish.model}
                  disabled={exporting || polish.models.length === 0}
                  onChange={(e) => polish.setModel(e.target.value)}
                  className="rounded border border-border bg-transparent px-1.5 py-0.5"
                >
                  {polish.models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                data-testid="media-detail-export-pdf"
                disabled={!canExport || exporting || includedCount === 0}
                onClick={() => onExport("pdf")}
              >
                {exporting ? "Creating…" : "PDF"}
              </Button>
              <Button
                variant="outline"
                data-testid="media-detail-export-md"
                disabled={!canExport || exporting || includedCount === 0}
                onClick={() => onExport("md")}
              >
                Markdown
              </Button>
            </div>
            {exporting && polish.providerId && (
              <p data-testid="media-detail-export-progress" className="mt-2 text-xs text-foreground/55">
                Distilling the transcript with AI — this can take a while…
              </p>
            )}
            {documentPath && (
              <button
                type="button"
                data-testid="media-detail-document-path"
                onClick={() => onRevealDocument(documentPath)}
                className="mt-2 block max-w-full truncate text-left text-xs text-primary underline-offset-2 hover:underline"
                title={documentPath}
              >
                Saved to {documentPath} — reveal
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
