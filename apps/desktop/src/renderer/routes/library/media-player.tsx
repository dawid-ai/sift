import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { mediaFileUrl } from "@/lib/utils";

export interface MediaPlayerHandle {
  seekTo(sec: number): void;
}

export interface MediaPlayerProps {
  filePath: string | null;
  thumbnailUrl: string | null;
  onTime: (sec: number) => void;
  onDownload: () => void;
  downloading: boolean;
}

/** Plays a downloaded file via the sift-media:// protocol with native controls. When there is
 * no downloaded file, shows the thumbnail as a poster with a Download-to-play button. Exposes
 * seekTo() so the transcript can jump the player, and reports currentTime via onTime. */
export const MediaPlayer = forwardRef<MediaPlayerHandle, MediaPlayerProps>(function MediaPlayer(
  { filePath, thumbnailUrl, onTime, onDownload, downloading },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [filePath]);

  useImperativeHandle(ref, () => ({
    seekTo(sec: number) {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = sec;
      v.play().catch(() => {});
    },
  }));

  if (filePath && !failed) {
    return (
      <video
        ref={videoRef}
        data-testid="media-detail-player"
        controls
        src={mediaFileUrl(filePath)}
        poster={thumbnailUrl ?? undefined}
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
