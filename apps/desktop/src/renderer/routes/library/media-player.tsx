import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { Download, Film, Maximize2, Pause, Play, TriangleAlert, Volume2, VolumeX } from "lucide-react";
import type { FrameCrop } from "@sift/ipc-contract";
import { Button } from "@/components/ui/button";
import { mediaFileUrl } from "@/lib/utils";

/** One card recipe for the whole detail route: a top-lit surface (brighter top edge, faint
 * inset highlight) so the panel picks up the ambient warmth instead of sitting flat. Kept as a
 * local constant per panel file — nothing outside this route should depend on it. */
const CARD =
  "rounded-2xl border border-white/[0.07] border-t-white/[0.10] " +
  "bg-gradient-to-b from-white/[0.045] to-white/[0.015] " +
  "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]";

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

/** The poster is painted as a CSS background, never as an `<img>`: a dead or slow thumbnail
 * URL made Chromium paint its broken-asset glyph in the corner of the biggest element on the
 * page. As a background it simply fails to nothing and the token gradient underneath shows
 * through. `JSON.stringify` quotes/escapes the URL so a stray `)` can't break out of `url()`. */
function posterStyle(url: string | null): { backgroundImage: string } | undefined {
  return url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined;
}

/** m:ss for the transport readout. */
function clock(sec: number): string {
  const t = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const SPEEDS = [0.5, 1, 1.5, 2] as const;
const SPEED_KEY = "sift.playbackRate";

/** Plays a downloaded file via the sift-media:// protocol behind a custom transport bar (the
 * native Chromium control set is the loudest unstyled tell on the page), plus a playback-speed
 * group (persisted). Exposes seekTo()/getCurrentTime() so the transcript and the Slides panel
 * can drive it; reports currentTime via onTime. */
export const MediaPlayer = forwardRef<MediaPlayerHandle, MediaPlayerProps>(function MediaPlayer(
  { filePath, thumbnailUrl, onTime, onDownload, downloading, crop, cropEditing, onCropDraw },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [rate, setRate] = useState(() => Number(localStorage.getItem(SPEED_KEY)) || 1);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<FrameCrop | null>(null);
  // Transport state. Presentation only — the <video> element remains the source of truth.
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  // The speed group collapses to one chip + a menu, so the seek track keeps the shelf.
  const [speedOpen, setSpeedOpen] = useState(false);
  const speedRef = useRef<HTMLDivElement>(null);

  const pointToFrac = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const rect = boxRef.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - rect.left) / rect.width), y: clamp01((e.clientY - rect.top) / rect.height) };
  };
  const activeRect = dragRect ?? crop ?? null;

  useEffect(() => {
    setFailed(false);
    setReady(false);
    setPlaying(false);
    setPosition(0);
    setDuration(0);
  }, [filePath]);

  // Re-apply the rate whenever it changes or the <video> element is (re)mounted — a fresh
  // media element defaults back to 1×.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [rate, filePath, failed]);

  // Dismiss the speed menu on an outside press or Escape. Bound only while it is open, so a
  // resting player adds no document-level listeners.
  useEffect(() => {
    if (!speedOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!speedRef.current?.contains(e.target as Node)) setSpeedOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSpeedOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [speedOpen]);

  function changeRate(r: number) {
    setRate(r);
    setSpeedOpen(false);
    localStorage.setItem(SPEED_KEY, String(r));
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  function toggleMuted() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void cardRef.current?.requestFullscreen().catch(() => {});
  }

  function seekFromPointer(e: { clientX: number }) {
    const v = videoRef.current;
    const el = trackRef.current;
    if (!v || !el || !Number.isFinite(v.duration) || v.duration <= 0) return;
    const r = el.getBoundingClientRect();
    const next = clamp01((e.clientX - r.left) / r.width) * v.duration;
    v.currentTime = next;
    setPosition(next);
  }

  function nudge(e: ReactKeyboardEvent<HTMLDivElement>) {
    const v = videoRef.current;
    if (!v) return;
    const step = e.key === "ArrowLeft" ? -5 : e.key === "ArrowRight" ? 5 : 0;
    if (step === 0) return;
    e.preventDefault();
    v.currentTime = Math.min(v.duration || 0, Math.max(0, v.currentTime + step));
    setPosition(v.currentTime);
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

  const pct = duration > 0 ? clamp01(position / duration) * 100 : 0;

  // Before the first frame is painted the media well is a pure-black rectangle — the largest
  // and least designed element on the page. Until playback starts it wears a poster instead:
  // the thumbnail under a scrim, on the same lit surface as every other card here.
  const showPoster = !playing && position === 0;

  if (filePath && !failed) {
    return (
      <div className="flex w-full min-h-0 flex-col">
        {/* One surface: a full-bleed media well with the transport bar as its footer. No inner
            gutter — every other card on the route carries p-5, this one carries the picture. */}
        <div
          ref={cardRef}
          className={`${CARD} flex min-h-0 flex-col overflow-hidden [&:fullscreen]:rounded-none [&:fullscreen]:border-transparent [&:fullscreen]:bg-black`}
        >
          {/* boxRef stays flush to the <video> (inset-0, object-contain over a 16:9 well) so the
              crop fractions keep mapping 1:1 onto the picture. */}
          <div
            ref={boxRef}
            className="relative aspect-video w-full min-h-0 overflow-hidden bg-[#141010] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] ring-1 ring-inset ring-white/[0.06] [:fullscreen_&]:aspect-auto [:fullscreen_&]:min-h-0 [:fullscreen_&]:flex-1"
          >
            <video
              ref={videoRef}
              data-testid="media-detail-player"
              src={mediaFileUrl(filePath)}
              poster={thumbnailUrl ?? undefined}
              onLoadedMetadata={(e) => {
                e.currentTarget.playbackRate = rate;
                // Live/unknown-length streams report Infinity — keep the readout at 0:00
                // rather than printing "Infinity" into the aria value.
                const d = e.currentTarget.duration;
                setDuration(Number.isFinite(d) ? d : 0);
                setReady(true);
              }}
              onTimeUpdate={(e) => {
                onTime(e.currentTarget.currentTime);
                if (!scrubbing) setPosition(e.currentTarget.currentTime);
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              // A broken `poster` image also dispatches an `error` event on the <video> element
              // itself (Chromium quirk) but leaves `.error` (MediaError) null — only a real
              // load/decode failure on the media resource sets it, so gate on that to avoid
              // falling back to the poster over a thumbnail hiccup.
              onError={(e) => {
                if (e.currentTarget.error) setFailed(true);
              }}
              className="absolute inset-0 block h-full w-full object-contain"
            />
            {/* Poster state, so the frame is never an empty black hole. Every scrim layer stays
                click-through; the 56px disc does NOT — it re-enables pointer events on itself
                alone. It is the largest affordance on the page and every convention a user
                brings to a video frame says it starts playback, so it now does. `tabIndex={-1}`
                + `aria-hidden` keep it out of the tab order and out of the accessibility tree,
                where the labelled "Play" button in the transport remains the single announced
                control — the point the old comment was defending, minus the dead disc. */}
            {showPoster && (
              <span aria-hidden className="pointer-events-none absolute inset-0 block">
                {/* Token gradient first, thumbnail second — the well is a designed surface even
                    when the thumbnail 404s, instead of a black hole with a broken-image mark. */}
                <span className="pointer-events-none absolute inset-0 block bg-gradient-to-b from-surface-2 to-[#141010]" />
                <span
                  className="pointer-events-none absolute inset-0 block bg-cover bg-center opacity-70"
                  style={posterStyle(thumbnailUrl)}
                />
                {/* 60% scrim, warmed toward the bottom so the transport reads as attached. */}
                <span className="pointer-events-none absolute inset-0 block bg-black/60" />
                <span className="pointer-events-none absolute inset-0 block bg-[radial-gradient(circle_at_50%_42%,rgba(255,138,77,0.10),transparent_62%)]" />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 block h-24 bg-gradient-to-t from-black/55 to-transparent" />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  onClick={togglePlay}
                  className="pointer-events-auto absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/15 bg-white/[0.08] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)] transition-colors duration-150 hover:border-white/25 hover:bg-white/[0.14] focus-visible:outline-none"
                >
                  <Play className="h-5 w-5 translate-x-[1px] fill-current text-white/90" />
                </button>
              </span>
            )}
            {/* Lifts the well off pure black so it reads as a lit surface, not a hole. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.035),transparent_60%)]"
            />
            {!ready && !showPoster && (
              <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/25 border-t-primary opacity-60 motion-reduce:animate-none" />
              </span>
            )}
            {/* Viewfinder reticle — all four corners, and only while the picture is live, so it
                reads as a state and not as a stray artifact on the card edge. */}
            {playing && (
              <span aria-hidden className="pointer-events-none absolute inset-2">
                <span className="absolute left-0 top-0 h-2.5 w-2.5 border-l border-t border-primary/40" />
                <span className="absolute right-0 top-0 h-2.5 w-2.5 border-r border-t border-primary/40" />
                <span className="absolute bottom-0 left-0 h-2.5 w-2.5 border-b border-l border-primary/40" />
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 border-b border-r border-primary/40" />
              </span>
            )}
            {(activeRect || cropEditing) && (
              // Editing → capture drags to define the crop; otherwise a click-through outline.
              <div
                data-testid="media-detail-crop-overlay"
                className={`absolute inset-0 ${cropEditing ? "cursor-crosshair" : "pointer-events-none"}`}
                onPointerDown={
                  cropEditing
                    ? (e: ReactPointerEvent<HTMLDivElement>) => {
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
                    // While editing, a huge spread shadow doubles as the "everything outside
                    // the box is excluded" mask (clipped by the parent's overflow-hidden).
                    className={`absolute rounded-[3px] border-2 border-primary bg-primary/10 ${
                      cropEditing ? "shadow-[0_0_0_9999px_hsl(var(--background)/0.45)]" : ""
                    }`}
                    style={{
                      left: `${activeRect.x * 100}%`,
                      top: `${activeRect.y * 100}%`,
                      width: `${activeRect.w * 100}%`,
                      height: `${activeRect.h * 100}%`,
                    }}
                  />
                )}
                {cropEditing && (
                  <div className="absolute left-3 top-3 rounded-full border border-primary/30 bg-background/90 px-2.5 py-1 text-[11px] font-medium text-primary">
                    Drag a box over the slide area
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Transport. Replaces the native control set wholesale: one row, 44px, monochrome
              glyphs, one amber fill on the played portion of the track. */}
          <div className="flex h-12 flex-none items-center gap-3 border-t border-white/[0.07] bg-white/[0.04] px-3">
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
              className="grid h-8 w-8 flex-none place-items-center rounded-md text-foreground/70 transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <span className="flex-none text-[12px] tabular-nums text-muted-foreground">
              {clock(position)}
              <span className="px-1 text-foreground/25">/</span>
              {clock(duration)}
            </span>

            <div
              ref={trackRef}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, Math.round(duration))}
              aria-valuenow={Math.round(position)}
              aria-valuetext={clock(position)}
              tabIndex={0}
              onKeyDown={nudge}
              onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setScrubbing(true);
                seekFromPointer(e);
              }}
              onPointerMove={(e) => {
                if (scrubbing) seekFromPointer(e);
              }}
              onPointerUp={() => setScrubbing(false)}
              onPointerCancel={() => setScrubbing(false)}
              className="group relative flex h-5 min-w-0 flex-1 cursor-pointer items-center rounded-full py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {/* A hairline reads as a divider, not as the player's primary control: 6px track
                  at white/15, an amber played segment, and a handle that is ALWAYS present —
                  a seek bar with nothing to grab at rest offers no target and no playhead, so
                  the 10px knob only grows (to 14px) on hover/focus/scrub, all inside a 20px
                  pointer target. */}
              <span aria-hidden className="absolute inset-x-0 h-1.5 rounded-full bg-white/[0.15]" />
              <span
                aria-hidden
                className="absolute left-0 h-1.5 min-w-[3px] rounded-full bg-gradient-to-r from-primary to-primary-lit"
                style={{ width: `${pct}%` }}
              />
              <span
                aria-hidden
                className={`absolute -translate-x-1/2 rounded-full bg-foreground shadow-[0_0_0_3px_rgba(0,0,0,0.45)] transition-[height,width] duration-150 group-hover:h-3.5 group-hover:w-3.5 group-focus-visible:h-3.5 group-focus-visible:w-3.5 ${
                  scrubbing ? "h-3.5 w-3.5" : "h-2.5 w-2.5"
                }`}
                style={{ left: `${pct}%` }}
              />
            </div>

            {/* Playback speed. Four always-visible presets ate 173px of a 736px bar and left the
                seek track — the control this transport exists for — at 42% of its own shelf. It
                collapses to one chip, the way the volume control collapses to one glyph, and the
                track's flex-1 absorbs the difference. */}
            <div ref={speedRef} className="relative flex-none">
              <button
                type="button"
                data-testid="media-detail-speed-menu"
                aria-label="Playback speed"
                aria-haspopup="menu"
                aria-expanded={speedOpen}
                onClick={() => setSpeedOpen((v) => !v)}
                className={`grid h-8 min-w-[34px] flex-none place-items-center rounded-md px-1.5 text-[12px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                  speedOpen || rate !== 1
                    ? "bg-white/[0.08] text-foreground"
                    : "text-foreground/70 hover:bg-white/[0.06] hover:text-foreground"
                }`}
              >
                {rate}×
              </button>
              {speedOpen && (
                <div
                  role="menu"
                  className="absolute bottom-full right-0 z-20 mb-2 flex w-[62px] flex-col gap-0.5 rounded-xl border border-white/10 bg-[#171212] p-1 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.95)]"
                >
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="menuitemradio"
                      aria-checked={rate === s}
                      data-testid={`media-detail-speed-${s}`}
                      onClick={() => changeRate(s)}
                      className={`rounded-lg px-2 py-1 text-left text-[12px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                        rate === s
                          ? "bg-primary/[0.18] text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.3)]"
                          : "text-foreground/60 hover:bg-white/[0.07] hover:text-foreground"
                      }`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Same 32px hit surface as the play control and the speed chips — three different
                control treatments in one 44px bar was the tell. */}
            <button
              type="button"
              aria-label={muted ? "Unmute" : "Mute"}
              onClick={toggleMuted}
              className="grid h-8 w-8 flex-none place-items-center rounded-md text-foreground/70 transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              aria-label="Fullscreen"
              onClick={toggleFullscreen}
              className="grid h-8 w-8 flex-none place-items-center rounded-md text-foreground/70 transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="media-detail-player"
      className={`${CARD} relative flex aspect-video w-full min-h-0 flex-col items-center justify-center overflow-hidden bg-[#141010]`}
    >
      {/* Same rule as the poster layer above: background-image, never an <img>, so a missing
          thumbnail degrades to the surface gradient rather than to a broken-asset glyph. */}
      <span
        aria-hidden
        className="absolute inset-0 block bg-gradient-to-b from-surface-2 to-[#141010] bg-cover bg-center opacity-40"
        style={posterStyle(thumbnailUrl)}
      />
      {!thumbnailUrl && (
        <span aria-hidden className="absolute inset-0 grid place-items-center text-foreground/[0.10]">
          <Film className="h-8 w-8" />
        </span>
      )}
      {/* Scrim: keeps the poster readable as texture without competing with the message. */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-background/30" />
      <div className="relative flex flex-col items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-7 py-6 text-center">
        <span
          className={`grid h-8 w-8 place-items-center rounded-lg ${
            failed ? "bg-danger/12 text-danger" : "bg-white/[0.05] text-foreground/55"
          }`}
          aria-hidden
        >
          {failed ? <TriangleAlert className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        </span>
        {failed ? (
          <p className="text-[13px] font-semibold text-foreground">Couldn&apos;t play this file</p>
        ) : (
          <>
            <p className="text-[13px] font-semibold text-foreground">Not downloaded yet</p>
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
