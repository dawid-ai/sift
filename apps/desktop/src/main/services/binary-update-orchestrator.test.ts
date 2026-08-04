import { describe, expect, it } from "vitest";
import { decideUpdateAction } from "./binary-update-orchestrator";

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
