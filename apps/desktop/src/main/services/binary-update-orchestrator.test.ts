import { describe, expect, it } from "vitest";
import { decideUpdateAction } from "./binary-update-orchestrator";
import type { BinaryStatus, BinaryUpdateEvent, BinaryKind } from "@sift/ipc-contract";
import { runStartupBinaryMaintenance } from "./binary-update-orchestrator";

describe("decideUpdateAction", () => {
  it("not installed → install-required (regardless of policy)", () => {
    expect(decideUpdateAction({ installed: false, updateAvailable: false, policy: "auto" })).toBe("install-required");
    expect(decideUpdateAction({ installed: false, updateAvailable: true, policy: "notify" })).toBe("install-required");
  });
  it("installed + update + auto → auto-update", () => {
    expect(decideUpdateAction({ installed: true, updateAvailable: true, policy: "auto" })).toBe("auto-update");
  });
  it("installed + update + notify → notify", () => {
    expect(decideUpdateAction({ installed: true, updateAvailable: true, policy: "notify" })).toBe("notify");
  });
  it("installed + no update → none", () => {
    expect(decideUpdateAction({ installed: true, updateAvailable: false, policy: "auto" })).toBe("none");
    expect(decideUpdateAction({ installed: true, updateAvailable: false, policy: "notify" })).toBe("none");
  });
});

function status(kind: BinaryKind, over: Partial<BinaryStatus> = {}): BinaryStatus {
  return { kind, installed: true, installedVersion: "1", latestVersion: "1", updateAvailable: false, path: "/x", ...over };
}

const DAY = 24 * 60 * 60 * 1000;

describe("runStartupBinaryMaintenance", () => {
  it("installs a missing binary and emits installing → ready(installed)", async () => {
    const events: BinaryUpdateEvent[] = [];
    const installed: BinaryKind[] = [];
    await runStartupBinaryMaintenance({
      kinds: ["ytdlp"],
      list: async () => [status("ytdlp", { installed: false, installedVersion: null })],
      getLastChecked: () => null,
      check: async () => { throw new Error("check must not run for a missing binary"); },
      install: async (k) => { installed.push(k); return status(k, { installedVersion: "2024.09.01" }); },
      policy: () => "auto",
      emit: (e) => events.push(e),
      now: () => 1_000_000,
    });
    expect(installed).toEqual(["ytdlp"]);
    expect(events).toEqual([
      { type: "installing", kind: "ytdlp" },
      { type: "ready", kind: "ytdlp", version: "2024.09.01", reason: "installed" },
    ]);
  });

  it("skips the network check when last_checked is within the throttle window", async () => {
    let checked = false;
    await runStartupBinaryMaintenance({
      kinds: ["ytdlp"],
      list: async () => [status("ytdlp")],
      getLastChecked: () => 999_000, // 1000ms ago vs now
      check: async () => { checked = true; return status("ytdlp"); },
      install: async (k) => status(k),
      policy: () => "auto",
      emit: () => {},
      now: () => 1_000_000,
      throttleMs: DAY,
    });
    expect(checked).toBe(false);
  });

  it("auto policy: outdated → installing → ready(updated)", async () => {
    const events: BinaryUpdateEvent[] = [];
    await runStartupBinaryMaintenance({
      kinds: ["ytdlp"],
      list: async () => [status("ytdlp", { installedVersion: "old" })],
      getLastChecked: () => 0, // stale
      check: async () => status("ytdlp", { installedVersion: "old", latestVersion: "new", updateAvailable: true }),
      install: async (k) => status(k, { installedVersion: "new" }),
      policy: () => "auto",
      emit: (e) => events.push(e),
      now: () => 1_000_000,
    });
    expect(events).toEqual([
      { type: "installing", kind: "ytdlp" },
      { type: "ready", kind: "ytdlp", version: "new", reason: "updated" },
    ]);
  });

  it("notify policy: outdated → available, no install", async () => {
    const events: BinaryUpdateEvent[] = [];
    let installs = 0;
    await runStartupBinaryMaintenance({
      kinds: ["ytdlp"],
      list: async () => [status("ytdlp", { installedVersion: "old" })],
      getLastChecked: () => 0,
      check: async () => status("ytdlp", { installedVersion: "old", latestVersion: "new", updateAvailable: true }),
      install: async (k) => { installs++; return status(k); },
      policy: () => "notify",
      emit: (e) => events.push(e),
      now: () => 1_000_000,
    });
    expect(installs).toBe(0);
    expect(events).toEqual([
      { type: "available", kind: "ytdlp", installedVersion: "old", latestVersion: "new" },
    ]);
  });

  it("emits error and continues to the next kind when check throws", async () => {
    const events: BinaryUpdateEvent[] = [];
    await runStartupBinaryMaintenance({
      kinds: ["ytdlp", "deno"],
      list: async () => [status("ytdlp"), status("deno", { installed: false, installedVersion: null })],
      getLastChecked: () => 0,
      check: async () => { throw new Error("network down"); },
      install: async (k) => status(k, { installedVersion: "1.0.0" }),
      policy: () => "auto",
      emit: (e) => events.push(e),
      now: () => 1_000_000,
    });
    expect(events).toEqual([
      { type: "error", kind: "ytdlp", message: "network down" },
      { type: "installing", kind: "deno" },
      { type: "ready", kind: "deno", version: "1.0.0", reason: "installed" },
    ]);
  });

  it("never throws when list() itself rejects — does nothing", async () => {
    const events: BinaryUpdateEvent[] = [];
    await expect(
      runStartupBinaryMaintenance({
        kinds: ["ytdlp"],
        list: async () => { throw new Error("db down"); },
        getLastChecked: () => null,
        check: async () => { throw new Error("unused"); },
        install: async (k) => status(k),
        policy: () => "auto",
        emit: (e) => events.push(e),
        now: () => 1_000_000,
      }),
    ).resolves.toBeUndefined();
    expect(events).toEqual([]);
  });

  it("never throws even if emit() itself throws", async () => {
    let calls = 0;
    await expect(
      runStartupBinaryMaintenance({
        kinds: ["ytdlp"],
        list: async () => [status("ytdlp", { installed: false, installedVersion: null })],
        getLastChecked: () => null,
        check: async () => status("ytdlp"),
        install: async (k) => status(k, { installedVersion: "1" }),
        policy: () => "auto",
        emit: () => { calls++; throw new Error("send failed"); },
        now: () => 1_000_000,
      }),
    ).resolves.toBeUndefined();
    expect(calls).toBeGreaterThan(0);
  });

  it("never throws if getLastChecked() throws", async () => {
    await expect(
      runStartupBinaryMaintenance({
        kinds: ["ytdlp"],
        list: async () => [status("ytdlp")],
        getLastChecked: () => { throw new Error("db read failed"); },
        check: async () => status("ytdlp", { updateAvailable: true, latestVersion: "new" }),
        install: async (k) => status(k),
        policy: () => "auto",
        emit: () => {},
        now: () => 1_000_000,
      }),
    ).resolves.toBeUndefined();
  });
});
