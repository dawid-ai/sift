import { describe, expect, it } from "vitest";
import type { DownloadOption } from "@sift/ipc-contract";
import { resolveQueueFormat } from "./queue-format";

const opt = (id: string, kind: "video" | "audio"): DownloadOption => ({
  id,
  label: id,
  detail: "MP4",
  selector: `sel-${id}`,
  approxBytes: null,
  kind,
});

const OPTIONS: DownloadOption[] = [
  opt("1080p", "video"),
  opt("720p", "video"),
  opt("480p", "video"),
  opt("audio", "audio"),
];

describe("resolveQueueFormat", () => {
  it("audio pref → the audio option", () => {
    expect(
      resolveQueueFormat(OPTIONS, { kind: "audio", maxHeight: null, mp4: true })
        .id,
    ).toBe("audio");
  });

  it("video, no cap → highest resolution", () => {
    expect(
      resolveQueueFormat(OPTIONS, { kind: "video", maxHeight: null, mp4: true })
        .id,
    ).toBe("1080p");
  });

  it("video with cap → highest at or below the cap", () => {
    expect(
      resolveQueueFormat(OPTIONS, { kind: "video", maxHeight: 720, mp4: true })
        .id,
    ).toBe("720p");
  });

  it("cap below every option → lowest video option", () => {
    expect(
      resolveQueueFormat(OPTIONS, { kind: "video", maxHeight: 144, mp4: true })
        .id,
    ).toBe("480p");
  });

  it("fallback single 'best' option (extractor with no enumerated formats)", () => {
    const best = [opt("best", "video"), opt("audio", "audio")];
    expect(
      resolveQueueFormat(best, { kind: "video", maxHeight: 1080, mp4: true })
        .id,
    ).toBe("best");
  });

  it("audio pref but no audio option → first option", () => {
    const videosOnly = [opt("1080p", "video")];
    expect(
      resolveQueueFormat(videosOnly, {
        kind: "audio",
        maxHeight: null,
        mp4: true,
      }).id,
    ).toBe("1080p");
  });
});
