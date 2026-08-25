import { describe, expect, it } from "vitest";
import {
  countNewSince,
  isShort,
  normalizeChannel,
  normalizeChannelEntries,
} from "./normalize";
import { normalizeSubscriptions } from "./normalize";

const RAW_CHANNEL = {
  id: "UC_abc",
  channel_id: "UC_abc",
  channel: "Cool Channel",
  title: "Cool Channel - Videos",
  uploader_id: "@cool",
  description: "desc",
  channel_follower_count: 12345,
  playlist_count: 200,
  thumbnails: [
    { url: "https://x/avatar.jpg", width: 160, height: 160 },
    {
      url: "https://x/banner.jpg",
      width: 2048,
      height: 288,
      id: "banner_uncropped",
    },
  ],
  entries: [
    {
      id: "v1",
      url: "https://www.youtube.com/watch?v=v1",
      title: "Newest",
      duration: 600,
      view_count: 50,
    },
    {
      id: "v2",
      url: "https://www.youtube.com/watch?v=v2",
      title: "Older",
      duration: 120,
      view_count: 900,
    },
  ],
};

describe("normalizeChannel", () => {
  it("extracts identity + meta + banner/avatar + newest id", () => {
    const c = normalizeChannel(RAW_CHANNEL);
    expect(c.channelId).toBe("UC_abc");
    expect(c.handle).toBe("@cool");
    expect(c.title).toBe("Cool Channel"); // prefers `channel` over playlist `title`
    expect(c.followerCount).toBe(12345);
    expect(c.videoCount).toBe(200);
    expect(c.bannerUrl).toBe("https://x/banner.jpg"); // widest / id contains "banner"
    expect(c.avatarUrl).toBe("https://x/avatar.jpg"); // squarish
    expect(c.newestVideoId).toBe("v1");
  });
  it("throws when there is no channel id", () => {
    expect(() => normalizeChannel({ entries: [] })).toThrow(/channel/i);
  });
});

describe("normalizeChannelEntries + isShort", () => {
  it("maps entries and flags shorts by tab", () => {
    const vids = normalizeChannelEntries(RAW_CHANNEL, "shorts");
    expect(vids[0]!.externalId).toBe("v1");
    expect(vids.every((v) => v.isShort)).toBe(true); // shorts tab → all short
  });
  it("resolves a site-relative entry url and keeps a /shorts/ path", () => {
    const out = normalizeChannelEntries(
      {
        entries: [
          { id: "a1", url: "/watch?v=a1", title: "Relative watch" },
          { id: "s1", url: "/shorts/s1", title: "Relative short" },
          { id: "n1", title: "No url at all" },
          {
            id: "b1",
            url: "https://www.youtube.com/watch?v=b1",
            title: "Absolute",
          },
        ],
      },
      "videos",
    );
    expect(out.map((v) => v.url)).toEqual([
      "https://www.youtube.com/watch?v=a1",
      "https://www.youtube.com/shorts/s1",
      "https://www.youtube.com/watch?v=n1",
      "https://www.youtube.com/watch?v=b1",
    ]);
    // The resolved /shorts/ path still reads as a Short — substituting a watch URL built
    // from the id would have lost that.
    expect(out.find((v) => v.externalId === "s1")!.isShort).toBe(true);
  });

  it("videos tab: short by /shorts/ url or <=60s duration", () => {
    expect(isShort("https://www.youtube.com/shorts/x", 600, "videos")).toBe(
      true,
    );
    expect(isShort("https://www.youtube.com/watch?v=x", 45, "videos")).toBe(
      true,
    );
    expect(isShort("https://www.youtube.com/watch?v=x", 600, "videos")).toBe(
      false,
    );
  });
  it("live: entries map as long-form (never short)", () => {
    const vids = normalizeChannelEntries(RAW_CHANNEL, "live");
    expect(vids.every((v) => !v.isShort)).toBe(true);
  });
  it("isShort is false for live content type", () => {
    expect(isShort("https://www.youtube.com/watch?v=x", 45, "live")).toBe(
      false,
    );
  });
});

describe("countNewSince", () => {
  const e = (id: string) => ({ externalId: id });
  it("counts entries before lastSeen", () => {
    expect(countNewSince([e("v3"), e("v2"), e("v1")], "v1", 30)).toBe(2);
  });
  it("zero when newest equals lastSeen", () => {
    expect(countNewSince([e("v1"), e("v0")], "v1", 30)).toBe(0);
  });
  it("lastSeen not in page → pageSize (at least this many new)", () => {
    expect(countNewSince([e("v9"), e("v8")], "v1", 30)).toBe(2);
  });
  it("null lastSeen (first ever) → 0", () => {
    expect(countNewSince([e("v1")], null, 30)).toBe(0);
  });
});

describe("normalizeSubscriptions", () => {
  it("maps channel entries and drops entries with no id", () => {
    const raw = {
      entries: [
        {
          id: "UCaaa",
          url: "https://www.youtube.com/channel/UCaaa",
          channel: "Alpha",
          uploader_id: "alpha",
          channel_follower_count: 1234,
          thumbnails: [{ url: "a.jpg", width: 100, height: 100 }],
        },
        { title: "no-id channel" }, // dropped
      ],
    };
    const out = normalizeSubscriptions(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      channelId: "UCaaa",
      url: "https://www.youtube.com/channel/UCaaa",
      handle: "@alpha",
      title: "Alpha",
      avatarUrl: "a.jpg",
      followerCount: 1234,
    });
  });

  it("falls back to a channel URL and null avatar when fields are absent", () => {
    const out = normalizeSubscriptions({ entries: [{ id: "UCbbb" }] });
    expect(out[0]!.url).toBe("https://www.youtube.com/channel/UCbbb");
    expect(out[0]!.avatarUrl).toBeNull();
    expect(out[0]!.handle).toBeNull();
    expect(out[0]!.title).toBe("UCbbb");
    expect(out[0]!.followerCount).toBeNull();
  });

  it("returns [] for a raw with no entries", () => {
    expect(normalizeSubscriptions({})).toEqual([]);
  });
});
