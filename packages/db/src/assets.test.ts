import { describe, expect, it } from "vitest";
import { openTestDatabase } from "./testing";
import { runMigrations } from "./migrations";
import { upsertAsset, getAsset, listAssets, touchAssetChecked } from "./assets";

async function freshDb() {
  const db = await openTestDatabase();
  runMigrations(db);
  return db;
}

describe("asset queries", () => {
  it("inserts then updates the same kind (upsert), and reads back", async () => {
    const db = await freshDb();
    upsertAsset(db, {
      kind: "ytdlp",
      name: "yt-dlp",
      version: "2024.08.06",
      path: "/a",
      sha256: "x",
      installed_at: 1,
      last_checked: 1,
    });
    upsertAsset(db, {
      kind: "ytdlp",
      name: "yt-dlp",
      version: "2024.09.01",
      path: "/b",
      sha256: "y",
      installed_at: 2,
      last_checked: 2,
    });
    const got = getAsset(db, "ytdlp");
    expect(got?.version).toBe("2024.09.01");
    expect(listAssets(db)).toHaveLength(1); // upsert, not a second row
    db.close();
  });

  it("touchAssetChecked updates only last_checked", async () => {
    const db = await freshDb();
    upsertAsset(db, {
      kind: "ffmpeg",
      name: "ffmpeg",
      version: "7.0",
      path: "/f",
      sha256: "z",
      installed_at: 5,
      last_checked: 5,
    });
    touchAssetChecked(db, "ffmpeg", 99);
    const got = getAsset(db, "ffmpeg");
    expect(got?.last_checked).toBe(99);
    expect(got?.version).toBe("7.0");
    db.close();
  });
});
