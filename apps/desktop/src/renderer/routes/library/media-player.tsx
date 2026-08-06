import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { FrameCrop } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { mediaFileUrl } from "@/lib/utils";

export interface MediaPlayerHandle {
  /** Jump to `sec`. Plays only when `opts.play` is true (slide-click autoplay is opt-in). */
  seekTo(sec: number, opts?: { play?: boolean }): void;
  /** Current playhead position in seconds (works while paused — for manual frame capture). */
  getCurrentTime(): number;
}

export interface MediaPlayerProps {
  filePath: string | null;
  thumbnailUrl: string | null;
  onTime: (sec: number) => void;
  onDownload: () => void;
  downloading: boolean;
  /** The saved slide-area crop, drawn as an outline over the video. */
  crop?: FrameCrop | null;
  /** When true, dragging on the video defines a new crop (via onCropDraw). */
  cropEditing?: boolean;
  onCropDraw?: (crop: FrameCrop) => void;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

function rectBetween(a: { x: number; y: number }, b: { x: number; y: number }): FrameCrop {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

const SPEEDS = [0.5, 1, 1.5, 2] as const;
const SPEED_KEY = "sift.playbackRate";

/** Plays a downloaded file via the sift-media:// protocol with native controls, plus a
 * playback-speed row (persisted). Exposes seekTo()/getCurrentTime() so the transcript and
 * the Slides panel can drive it; reports currentTime via onTime. */
export const MediaPlayer = forwardRef<MediaPlayerHandle, MediaPlayerProps>(function MediaPlayer(
  { filePath, thumbnailUrl, onTime, onDownload, downloading, crop, cropEditing, onCropDraw },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [rate, setRate] = useState(() => Number(localStorage.getItem(SPEED_KEY)) || 1);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<FrameCrop | null>(null);

  const pointToFrac = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = boxRef.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - rect.left) / rect.width), y: clamp01((e.clientY - rect.top) / rect.height) };
  };
  const activeRect = dragRect ?? crop ?? null;

  useEffect(() => setFailed(false), [filePath]);

  // Re-apply the rate whenever it changes or the <video> element is (re)mounted — a fresh
  // media element defaults back to 1×.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [rate, filePath, failed]);

  function changeRate(r: number) {
    setRate(r);
    localStorage.setItem(SPEED_KEY, String(r));
  }

  useImperativeHandle(ref, () => ({
    seekTo(sec: number, opts?: { play?: boolean }) {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = sec;
      if (opts?.play) v.play().catch(() => {});
    },
    getCurrentTime() {
      return videoRef.current?.currentTime ?? 0;
    },
  }));

  if (filePath && !failed) {
    return (
      <div className="flex flex-col gap-2">
        <div ref={boxRef} className="relative">
          <video
            ref={videoRef}
            data-testid="media-detail-player"
            controls
            src={mediaFileUrl(filePath)}
            poster={thumbnailUrl ?? undefined}
            onLoadedMetadata={(e) => {
              e.currentTarget.playbackRate = rate;
            }}
            onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
            // A broken `poster` image also dispatches an `error` event on the <video> element
            // itself (Chromium quirk) but leaves `.error` (MediaError) null — only a real
            // load/decode failure on the media resource sets it, so gate on that to avoid
            // falling back to the poster over a thumbnail hiccup.
            onError={(e) => {
              if (e.currentTarget.error) setFailed(true);
            }}
            className="aspect-video w-full rounded-lg border border-border bg-black"
          />
          {(activeRect || cropEditing) && (
            // Editing → capture drags to define the crop; otherwise a click-through outline.
            <div
              data-testid="media-detail-crop-overlay"
              className={`absolute inset-0 rounded-lg ${cropEditing ? "cursor-crosshair" : "pointer-events-none"}`}
              onPointerDown={
                cropEditing
                  ? (e) => {
                      (e.target as HTMLElement).setPointerCapture(e.pointerId);
                      const p = pointToFrac(e);
                      setDragStart(p);
                      setDragRect({ x: p.x, y: p.y, w: 0, h: 0 });
                    }
                  : undefined
              }
              onPointerMove={
                cropEditing && dragStart ? (e) => setDragRect(rectBetween(dragStart, pointToFrac(e))) : undefined
              }
              onPointerUp={
                cropEditing
                  ? () => {
                      if (dragRect && dragRect.w > 0.02 && dragRect.h > 0.02) onCropDraw?.(dragRect);
                      setDragStart(null);
                    }
                  : undefined
              }
            >
              {activeRect && (
                <div
                  className="absolute border-2 border-primary bg-primary/10"
                  style={{
                    left: `${activeRect.x * 100}%`,
                    top: `${activeRect.y * 100}%`,
                    width: `${activeRect.w * 100}%`,
                    height: `${activeRect.h * 100}%`,
                  }}
                />
              )}
              {cropEditing && (
                <div className="absolute left-2 top-2 rounded bg-background/85 px-2 py-1 text-xs text-foreground/80">
                  Drag a box over the slide area
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-foreground/55">
          <span>Speed</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`media-detail-speed-${s}`}
              onClick={() => changeRate(s)}
              className={`rounded px-1.5 py-0.5 tabular-nums transition-colors ${
                rate === s ? "bg-primary/15 text-primary" : "hover:bg-foreground/10"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="media-detail-player"
      className="relative flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border border-border"
    >
      {thumbnailUrl && (
        <img src={thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className="relative flex flex-col items-center gap-2 rounded-md bg-background/80 px-4 py-3">
        {failed ? (
          <p className="text-sm text-foreground/70">Couldn&apos;t play this file</p>
        ) : (
          <>
            <p className="text-sm text-foreground/70">Not downloaded yet</p>
            <Button
              size="sm"
              data-testid="media-detail-player-download"
              disabled={downloading}
              onClick={onDownload}
            >
              {downloading ? "Downloading…" : "Download to play"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
});
