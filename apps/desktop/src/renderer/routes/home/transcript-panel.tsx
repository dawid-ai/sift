import type { TranscriptRecord } from "@sift/ipc-contract";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/routes/home/preview-card";

export interface TranscriptPanelProps {
  transcript: TranscriptRecord;
}

/** Read-only presentational panel rendering a fetched transcript. */
export function TranscriptPanel({ transcript }: TranscriptPanelProps) {
  return (
    <Card data-testid="transcript-panel" className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-foreground/70">
          Transcript · {transcript.providerId}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {transcript.segments.length > 0 ? (
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto text-sm">
            {transcript.segments.map((seg, i) => (
              <div key={`${seg.start}-${i}`} data-testid="transcript-segment" className="flex gap-2">
                <span className="shrink-0 font-mono text-xs text-foreground/50">
                  {formatDuration(seg.start)}
                </span>
                <span>{seg.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm">
            {transcript.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
