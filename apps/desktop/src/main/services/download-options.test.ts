import { describe, expect, it } from "vitest";
import { computeDownloadOptions } from "./download-options";

// Mirrors a real YouTube `-J` formats slice: 1080p in three codecs (H.264 mp4,
// AV1 mp4, VP9 webm), 720p, and an m4a audio track.
const RAW = {
  formats: [
    { ext: "m4a", vcodec: "none", acodec: "mp4a.40.2", height: null, tbr: 129, filesize: 7_000_000 },
    { ext: "webm", vcodec: "opus", acodec: "opus", height: null, tbr: 145, filesize: 8_000_000 },
    { ext: "mp4", vcodec: "avc1.64002a", acodec: "none", height: 1080, tbr: 1455, filesize: 338_000_000 },
    { ext: "mp4", vcodec: "av01.0.09M.08", acodec: "none", height: 1080, tbr: 1354, filesize: 315_000_000 },
    { ext: "webm", vcodec: "vp9", acodec: "none", height: 1080, tbr: 2907, filesize: 676_000_000 },
    { ext: "mp4", vcodec: "avc1.4d401f", acodec: "none", height: 720, tbr: 640, filesize: 149_000_000 },
  ],
};

describe("computeDownloadOptions", () => {
  it("lists one option per height (mp4/H.264 preferred) plus audio, sizes = video + best audio", () => {
    const opts = computeDownloadOptions(RAW);

    // 1080p, 720p, then Audio only.
    expect(opts.map((o) => o.id)).toEqual(["1080p", "720p", "audio"]);

    const p1080 = opts[0]!;
    expect(p1080.kind).toBe("video");
    expect(p1080.detail).toBe("MP4"); // chose the mp4 stream over the larger webm/vp9
    expect(p1080.selector).toContain("[height<=1080][ext=mp4]");
    // best mp4 at 1080p is the higher-bitrate H.264 (338MB) not the AV1 (315MB); + 7MB audio
    expect(p1080.approxBytes).toBe(338_000_000 + 7_000_000);

    const audio = opts[2]!;
    expect(audio.kind).toBe("audio");
    expect(audio.detail).toBe("M4A");
    expect(audio.selector).toBe("ba[ext=m4a]/ba");
    expect(audio.approxBytes).toBe(7_000_000);
  });

  it("uses webm selector when a height has no mp4 stream", () => {
    const opts = computeDownloadOptions({
      formats: [
        { ext: "webm", vcodec: "vp9", acodec: "none", height: 1440, tbr: 4000, filesize: 900_000_000 },
        { ext: "m4a", vcodec: "none", acodec: "mp4a.40.2", height: null, tbr: 129, filesize: 7_000_000 },
      ],
    });
    const p1440 = opts.find((o) => o.id === "1440p")!;
    expect(p1440.detail).toBe("WEBM");
    expect(p1440.selector).toBe("bv*[height<=1440]+ba/b");
  });

  it("falls back to a single Best + Audio option when formats are absent", () => {
    const opts = computeDownloadOptions({});
    expect(opts.map((o) => o.id)).toEqual(["best", "audio"]);
    expect(opts[0]!.selector).toContain("[ext=mp4]");
    expect(opts[0]!.approxBytes).toBeNull();
  });

  it("does not throw on malformed input", () => {
    expect(() => computeDownloadOptions(null)).not.toThrow();
    expect(() => computeDownloadOptions({ formats: "nope" })).not.toThrow();
    expect(computeDownloadOptions(null).map((o) => o.id)).toEqual(["best", "audio"]);
  });
});
