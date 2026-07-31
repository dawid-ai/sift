import { describe, expect, it } from "vitest";
import { IPC } from "./index";

describe("IPC channel names", () => {
  it("follows the domain:verb convention", () => {
    expect(IPC.appGetVersion).toBe("app:getVersion");
    for (const channel of Object.values(IPC)) {
      expect(channel).toMatch(/^[a-z]+:[a-zA-Z]+$/);
    }
  });
});
