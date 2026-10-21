import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {}, BrowserWindow: class {}, session: {} }));

const { browserUserAgent } = await import("./sign-in-browser");

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.224";

describe("browserUserAgent", () => {
  it("drops the Electron and app tokens so Google serves its full sign-in flow", () => {
    expect(
      browserUserAgent(
        `${CHROME} Sift/0.8.3 Electron/43.4.1 Safari/537.36`,
        "Sift",
      ),
    ).toBe(`${CHROME} Safari/537.36`);
  });

  it("leaves a plain Chrome user agent unchanged", () => {
    expect(browserUserAgent(`${CHROME} Safari/537.36`, "Sift")).toBe(
      `${CHROME} Safari/537.36`,
    );
  });

  it("treats regex characters in the app name literally", () => {
    expect(browserUserAgent(`${CHROME} a.b/1 Safari/537.36`, "a.b")).toBe(
      `${CHROME} Safari/537.36`,
    );
    expect(browserUserAgent(`${CHROME} axb/1 Safari/537.36`, "a.b")).toBe(
      `${CHROME} axb/1 Safari/537.36`,
    );
  });
});
