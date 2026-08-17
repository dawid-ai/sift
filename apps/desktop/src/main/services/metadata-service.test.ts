import { describe, expect, it } from "vitest";
import { YtDlpNotInstalledError } from "../sidecars/ytdlp";
import type { YtDlpRunner } from "../sidecars/ytdlp";
import { MetadataService, normalizeMetadata } from "./metadata-service";

const CANNED_YOUTUBE_JSON = {
  id: "dQw4w9WgXcQ",
  title: "Never Gonna Give You Up",
  uploader: "Rick Astley",
  uploader_url: "https://www.youtube.com/@RickAstley",
  duration: 213,
  thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  view_count: 1500000000,
  like_count: 16000000,
  upload_date: "20091025",
  extractor_key: "Youtube",
  automatic_captions: {
    en: [{ url: "https://example.com/en.vtt", ext: "vtt" }],
  },
};

function fakeRunner(overrides: Partial<YtDlpRunner> = {}): YtDlpRunner {
  return {
    dumpJson: async () => CANNED_YOUTUBE_JSON,
    flatPlaylist: async () => ({}),
    listExtractors: async () => ["Youtube", "Vimeo"],
    download: async () => {
      throw new Error("download is not exercised by metadata-service tests");
    },
    fetchSubtitles: async () => null,
    ...overrides,
  };
}

describe("normalizeMetadata", () => {
  it("maps a canned YouTube -J object into MediaMetadata", () => {
    const result = normalizeMetadata(CANNED_YOUTUBE_JSON, "url");

    expect(result.sourceUrl).toBe("url");
    expect(result.title).toBe("Never Gonna Give You Up");
    expect(result.externalId).toBe("dQw4w9WgXcQ");
    expect(result.uploader).toBe("Rick Astley");
    expect(result.uploaderUrl).toBe("https://www.youtube.com/@RickAstley");
    expect(result.durationSec).toBe(213);
    expect(typeof result.durationSec).toBe("number");
    expect(result.thumbnailUrl).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
    );
    expect(result.viewCount).toBe(1500000000);
    expect(result.likeCount).toBe(16000000);
    expect(result.uploadDate).toBe("20091025");
    expect(result.platform).toEqual({
      id: "youtube",
      label: "YouTube",
      tier: "tested",
    });
    expect(result.hasCaptions).toBe(true);
    expect(result.raw).toBe(CANNED_YOUTUBE_JSON);
  });

  it("maps missing/absent fields to null and hasCaptions to false without throwing", () => {
    expect(() => normalizeMetadata(null, "url")).not.toThrow();
    expect(() => normalizeMetadata(undefined, "url")).not.toThrow();

    const result = normalizeMetadata({}, "url2");

    expect(result.sourceUrl).toBe("url2");
    expect(result.title).toBe("");
    expect(result.externalId).toBeNull();
    expect(result.uploader).toBeNull();
    expect(result.uploaderUrl).toBeNull();
    expect(result.durationSec).toBeNull();
    expect(result.thumbnailUrl).toBeNull();
    expect(result.viewCount).toBeNull();
    expect(result.likeCount).toBeNull();
    expect(result.uploadDate).toBeNull();
    expect(result.hasCaptions).toBe(false);
    expect(result.platform).toEqual({
      id: "unknown",
      label: "Unknown",
      tier: "unknown",
    });
  });

  it("extracts base-coded language and dedups caption languages across subtitles + automatic_captions", () => {
    const result = normalizeMetadata(
      {
        language: "en-US",
        subtitles: { pl: [{}], "en-GB": [{}] },
        automatic_captions: { en: [{}], "en-pl": [{}], "en-orig": [{}] },
      },
      "url",
    );
    expect(result.language).toBe("en");
    expect([...result.captionLanguages].sort()).toEqual(["en", "pl"]);
  });

  it("language is null and captionLanguages empty when absent", () => {
    const result = normalizeMetadata({}, "url");
    expect(result.language).toBeNull();
    expect(result.captionLanguages).toEqual([]);
  });

  it("falls back uploader/uploaderUrl to channel/channel_url and honors subtitles for hasCaptions", () => {
    const result = normalizeMetadata(
      {
        channel: "Some Channel",
        channel_url: "https://x/channel",
        subtitles: { en: [] },
      },
      "url3",
    );

    expect(result.uploader).toBe("Some Channel");
    expect(result.uploaderUrl).toBe("https://x/channel");
    expect(result.hasCaptions).toBe(true);
  });

  it("guards NaN/non-numeric numeric fields to null", () => {
    const result = normalizeMetadata(
      { duration: "not-a-number", view_count: NaN, like_count: undefined },
      "url4",
    );

    expect(result.durationSec).toBeNull();
    expect(result.viewCount).toBeNull();
    expect(result.likeCount).toBeNull();
  });
});

describe("MetadataService", () => {
  it("fetch() calls the runner's dumpJson and normalizes the result", async () => {
    const service = new MetadataService(fakeRunner());

    const result = await service.fetch(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );

    expect(result.title).toBe("Never Gonna Give You Up");
    expect(result.platform.tier).toBe("tested");
    expect(result.platform.id).toBe("youtube");
    expect(typeof result.durationSec).toBe("number");
    expect(result.hasCaptions).toBe(true);
    expect(result.raw).toBe(CANNED_YOUTUBE_JSON);
    expect(result.sourceUrl).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("listExtractors() delegates to the runner", async () => {
    const service = new MetadataService(fakeRunner());

    await expect(service.listExtractors()).resolves.toEqual([
      "Youtube",
      "Vimeo",
    ]);
  });

  it("fetch() rejects with YtDlpNotInstalledError when the runner has no binary installed", async () => {
    const service = new MetadataService(
      fakeRunner({
        dumpJson: async () => {
          throw new YtDlpNotInstalledError();
        },
      }),
    );

    await expect(
      service.fetch("https://example.com/video"),
    ).rejects.toBeInstanceOf(YtDlpNotInstalledError);
  });

  it("passes a resolved cookies file into dumpJson", async () => {
    let seen: string | undefined;
    const runner = {
      dumpJson: async (_u: string, c?: string) => {
        seen = c;
        return {};
      },
    } as unknown as YtDlpRunner;
    const svc = new MetadataService(runner, {
      getCookiesFile: async () => "/c/youtube.txt",
    });
    await svc.fetch("https://www.youtube.com/watch?v=x");
    expect(seen).toBe("/c/youtube.txt");
  });
});

describe("MetadataService.fetch — local files", () => {
  it("synthesizes metadata for a file: URL without invoking yt-dlp", async () => {
    let dumpJsonCalls = 0;
    const service = new MetadataService(
      fakeRunner({
        dumpJson: async () => {
          dumpJsonCalls += 1;
          return CANNED_YOUTUBE_JSON;
        },
      }),
    );

    const meta = await service.fetch("file:///D:/vids/Team%20Standup.mp4");

    expect(dumpJsonCalls).toBe(0);
    expect(meta.title).toBe("Team Standup");
    expect(meta.platform.id).toBe("local");
    expect(meta.hasCaptions).toBe(false);
    expect(meta.sourceUrl).toBe("file:///D:/vids/Team%20Standup.mp4");
  });

  it("still goes to yt-dlp for a remote URL", async () => {
    let dumpJsonCalls = 0;
    const service = new MetadataService(
      fakeRunner({
        dumpJson: async () => {
          dumpJsonCalls += 1;
          return CANNED_YOUTUBE_JSON;
        },
      }),
    );

    await service.fetch("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(dumpJsonCalls).toBe(1);
  });
});
